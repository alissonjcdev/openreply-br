/**
 * Motor das publicações: avança cada post agendado pelo ciclo
 * SCHEDULED → PROCESSING → PUBLISHED (ou FAILED).
 *
 * Roda pelo cron publish-due (a cada minuto) e também na hora, quando alguém
 * clica em "Publicar agora". As duas entradas podem coincidir, então toda
 * mudança de estado é condicional (updateMany com o estado/versão esperados):
 * quem perde a corrida simplesmente não faz nada.
 */

import type { Publication, PublicationMedia, InstagramAccount } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  PublishError,
  containerStatus,
  createCarousel,
  createCarouselItem,
  createImage,
  createReel,
  mediaPermalink,
  publishContainer,
} from "./graph";
import { urlPublica } from "./storage";

const MAX_TENTATIVAS = 3;
/** Contêiner que não termina de processar em 30 min é dado como travado. */
const PROCESSAMENTO_MAXIMO_MS = 30 * 60_000;

type Completa = Publication & { media: PublicationMedia[]; instagramAccount: InstagramAccount };

const carregar = (id: string) =>
  prisma.publication.findUnique({
    where: { id },
    include: { media: { orderBy: { position: "asc" } }, instagramAccount: true },
  });

function credenciais(p: Completa) {
  if (p.instagramAccount.provider !== "META") throw new PublishError("Publicação só funciona com conta conectada pela Meta.", true);
  return { igUserId: p.instagramAccount.instagramId, token: decryptToken(p.instagramAccount.accessToken) };
}

async function criarConteineres(p: Completa) {
  const { igUserId, token } = credenciais(p);
  const itens = p.media.map((m) => ({ kind: m.kind, url: urlPublica(m) }));
  if (itens.length === 0) throw new PublishError("Publicação sem mídia.", true);

  if (p.mediaType === "IMAGE") return createImage(igUserId, token, itens[0].url, p.caption);
  if (p.mediaType === "REEL") return createReel(igUserId, token, itens[0].url, p.caption);
  if (itens.length < 2 || itens.length > 10) throw new PublishError("Carrossel precisa de 2 a 10 itens.", true);
  const filhos: string[] = [];
  for (const item of itens) filhos.push(await createCarouselItem(igUserId, token, item));
  return createCarousel(igUserId, token, filhos, p.caption);
}

async function publicar(p: Completa, containerId: string) {
  const { igUserId, token } = credenciais(p);
  const mediaId = await publishContainer(igUserId, token, containerId);
  const permalink = await mediaPermalink(mediaId, token);
  await prisma.publication.update({
    where: { id: p.id },
    data: { status: "PUBLISHED", igMediaId: mediaId, permalink, publishedAt: new Date(), lastError: null },
  });
  // campanha escolhida no agendamento passa a valer para este post
  if (p.automationId) {
    await prisma.automation.updateMany({
      where: { id: p.automationId, workspaceId: p.workspaceId },
      data: { postId: mediaId, postUrl: permalink, pendingNextReel: false, matchAnyPost: false, isActive: true },
    });
  }
  return mediaId;
}

async function falhar(p: Completa, erro: unknown) {
  const permanente = erro instanceof PublishError && erro.permanent;
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const tentarDeNovo = !permanente && p.attempts < MAX_TENTATIVAS;
  await prisma.publication.update({
    where: { id: p.id },
    data: tentarDeNovo
      ? // volta para a fila com espera crescente: 2, 4, 8 min
        { status: "SCHEDULED", containerId: null, lastError: mensagem, scheduledAt: new Date(Date.now() + 2 ** p.attempts * 60_000) }
      : { status: "FAILED", lastError: mensagem },
  });
  if (!tentarDeNovo) {
    await prisma.operationalEvent.create({
      data: {
        workspaceId: p.workspaceId,
        source: "WORKER",
        level: "ERROR",
        message: `Publicação ${p.id} falhou: ${mensagem}`.slice(0, 1000),
        payload: { publicationId: p.id, attempts: p.attempts },
      },
    });
  }
  console.error("[publicações]", p.id, mensagem);
}

/** Avança uma publicação um passo. Retorna o estado final desta rodada. */
export async function avancar(id: string): Promise<string> {
  let p = await carregar(id);
  if (!p) return "não encontrada";

  if (p.status === "SCHEDULED") {
    if (p.scheduledAt.getTime() > Date.now()) return "aguardando";
    // reserva: só um processo cria os contêineres
    const reservado = await prisma.publication.updateMany({
      where: { id, status: "SCHEDULED", updatedAt: p.updatedAt },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (reservado.count === 0) return "em uso";
    p = (await carregar(id))!;
    try {
      const containerId = await criarConteineres(p);
      await prisma.publication.update({ where: { id }, data: { containerId } });
      p = (await carregar(id))!;
    } catch (e) {
      await falhar(p, e);
      return "falhou";
    }
  }

  if (p.status !== "PROCESSING" || !p.containerId) return p.status.toLowerCase();

  // trava leve: marca que esta rodada está olhando o contêiner
  const tocado = await prisma.publication.updateMany({ where: { id, status: "PROCESSING", updatedAt: p.updatedAt }, data: { lastError: p.lastError } });
  if (tocado.count === 0) return "em uso";

  try {
    const { token } = credenciais(p);
    const status = await containerStatus(p.containerId, token);
    if (status.code === "FINISHED") {
      await publicar(p, p.containerId);
      return "publicada";
    }
    if (status.code === "PUBLISHED") {
      await prisma.publication.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      return "publicada";
    }
    if (status.code === "ERROR" || status.code === "EXPIRED") throw new PublishError(`A Meta não processou a mídia: ${status.detail || status.code}`);
    // scheduledAt é o início desta tentativa (a retentativa empurra o horário)
    if (Date.now() - p.scheduledAt.getTime() > PROCESSAMENTO_MAXIMO_MS)
      throw new PublishError("A mídia ficou mais de 30 minutos processando na Meta.");
    return "processando";
  } catch (e) {
    await falhar(p, e);
    return "falhou";
  }
}

/** Rodada do cron: tudo que já passou do horário ou está processando. */
export async function avancarPendentes(limite = 20) {
  const pendentes = await prisma.publication.findMany({
    where: { OR: [{ status: "SCHEDULED", scheduledAt: { lte: new Date() } }, { status: "PROCESSING" }] },
    orderBy: { scheduledAt: "asc" },
    take: limite,
    select: { id: true },
  });
  const resultado: Record<string, string> = {};
  for (const { id } of pendentes) resultado[id] = await avancar(id);
  return resultado;
}
