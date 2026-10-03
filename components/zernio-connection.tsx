"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import Image from 'next/image';
import { zernioLink } from '@/lib/zernio-links';

type ConnectionData = {
  configured: boolean; profileId?: string | null; webhookReady?: boolean;
  profiles: { id: string; name: string }[];
  accounts: { id: string; username: string; instagramId: string; connected?: boolean }[];
};

export function ZernioConnection({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<ConnectionData | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const response = await fetch('/api/zernio/settings', { cache: 'no-store' });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    setData(result.data);
    setProfileId(result.data.profileId ?? '');
  }, []);
  useEffect(() => {
    if (canManage) {
      void fetch('/api/zernio/settings', { cache: 'no-store' }).then(r => r.json()).then(result => {
        if (!result.success) throw new Error(result.error);
        setData(result.data); setProfileId(result.data.profileId ?? '');
      }).catch(e => setError(e instanceof Error ? e.message : "Could not load connection."));
    }
  }, [canManage, refresh]);

  async function act({ path = 'settings', method, body }: { path?: string; method: string; body?: unknown }) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/zernio/${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setApiKey('');
      if (result.data?.authUrl) { window.location.assign(result.data.authUrl); return; }
      if (path === 'accounts') { window.location.reload(); return; }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not update connection.")); }
    finally { setBusy(false); }
  }

  const actionRow = 'group-row w-full text-left text-[15px] first:rounded-t-xl last:rounded-b-xl disabled:opacity-50';

  return (
    <div className="space-y-2">
      <div className="group overflow-visible" aria-labelledby="zernio-heading" role="group">
        <div className="group-row items-start py-3">
          <div className="min-w-0 flex-1">
            <h3 id="zernio-heading" className="text-[15px] font-medium">{t("Easier Instagram setup")}</h3>
            <p className="footnote mt-0.5">{t("Optional connection provider")}</p>
          </div>
          <a href={zernioLink({ placement: 'settings-logo' })} target="_blank" rel="noopener noreferrer" aria-label={t("Zernio, OpenReply sponsor")} className="mt-0.5 shrink-0 opacity-90 hover:opacity-100">
            <Image src="/brand/zernio-primary.svg" alt="Zernio" width={76} height={16} className="h-4 w-auto" />
          </a>
        </div>

        <div className="group-row block py-3">
          <p className="text-[14px] leading-[20px] text-muted">{t("Connect Instagram without creating your own Meta developer app. Zernio is a paid service and an OpenReply sponsor. Your campaigns and hosting stay in OpenReply.")}</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            <a className="text-accent-text hover:underline" href={zernioLink({ path: '/signup', placement: 'settings-signup' })} target="_blank" rel="noopener noreferrer">{t("Get a Zernio API key")}</a>
            <a className="text-accent-text hover:underline" href={zernioLink({ path: '/pricing', placement: 'settings-pricing' })} target="_blank" rel="noopener noreferrer">{t("View pricing")}</a>
          </p>
        </div>

        {!canManage ? (
          <p className="group-row text-[15px] text-muted">{t("Ask your workspace owner or admin to configure Zernio.")}</p>
        ) : <>
          {error && <p role="alert" className="group-row text-[14px] text-error">{error === "Could not load connection." ? t("Could not load connection.") : error}</p>}
          {!data?.configured ? (
            <form className="group-row block space-y-2 py-3" onSubmit={e => { e.preventDefault(); void act({ method: 'POST', body: { apiKey } }); }}>
              <label className="block text-[15px]" htmlFor="zernio-api-key">{t("Zernio API key")}</label>
              <div className="flex flex-wrap gap-2">
                <input id="zernio-api-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} required className="field min-w-0 flex-1 basis-56" />
                <button disabled={busy || !apiKey} className="btn btn-primary">{busy ? t("Saving…") : t("Save API key")}</button>
              </div>
              <p className="footnote">{t("Use an unrestricted, read-write key with Inbox access. OpenReply registers a webhook for this workspace. The key is encrypted and never shown again.")}</p>
            </form>
          ) : <>
            <div className="group-row">
              <span className="text-[15px]">{t("Zernio API key")}</span>
              <span className="ml-auto text-right text-[15px] text-success">{t("API key saved securely.")}</span>
            </div>
            <form className="group-row flex-wrap gap-y-2" onSubmit={e => { e.preventDefault(); void act({ method: 'PUT', body: { profileId } }); }}>
              <span id="zernio-profile-label" className="text-[15px]">{t("Zernio profile")}</span>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <ProfileMenu
                  labelledBy="zernio-profile-label"
                  placeholder={t("Select a profile")}
                  profiles={data.profiles}
                  value={profileId}
                  onChange={setProfileId}
                />
                <button disabled={busy || !profileId} className="btn btn-sm btn-primary">{busy ? t("Configuring…") : data.webhookReady && profileId === data.profileId ? t("Repair webhook connection") : t("Save profile and configure webhook")}</button>
              </div>
              {!data.profiles.length && <p className="footnote basis-full">{t("Create a profile in Zernio, then refresh this page.")}</p>}
            </form>
            {data.webhookReady && <>
              <p className="group-row text-[14px] text-muted">{t("Webhook configured. Choose an Instagram account for OpenReply:")}</p>
              {data.accounts.map(a => (
                <div key={a.id} className="group-row">
                  <span className="min-w-0 flex-1 truncate text-[15px]">@{a.username}</span>
                  {a.connected
                    ? <span className="text-[15px] text-success">{t("Connected")}</span>
                    : <button type="button" disabled={busy} onClick={() => void act({ path: 'accounts', method: 'POST', body: { accountId: a.id } })} className="btn btn-sm btn-secondary">{t("Use in OpenReply")}</button>}
                </div>
              ))}
              <button type="button" disabled={busy} onClick={() => void act({ path: 'connect', method: 'POST' })} className={`${actionRow} text-accent-text`}>{t("Connect another Instagram account")}</button>
            </>}
            <button type="button" disabled={busy} onClick={() => { if (confirm(t("Remove the Zernio key and this OpenReply webhook? Disconnect its Instagram accounts from OpenReply first."))) void act({ method: 'DELETE' }); }} className={`${actionRow} text-error`}>{t("Remove Zernio connection")}</button>
          </>}
        </>}
      </div>
      {canManage && data?.webhookReady && (
        <p className="group-footer pt-0">{t("After connecting Instagram, return here and select it for OpenReply. Keep Zernio automations off for these campaigns to avoid sending twice.")}</p>
      )}
    </div>
  );
}

/** Pop-up button for the Zernio profile (replaces a native select). */
function ProfileMenu({ labelledBy, placeholder, profiles, value, onChange }: {
  labelledBy: string; placeholder: string; profiles: { id: string; name: string }[]; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = profiles.find(p => p.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        disabled={!profiles.length}
        onClick={() => setOpen(v => !v)}
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-1.5 py-1 text-[14px] text-muted hover:text-foreground disabled:opacity-50"
      >
        <span className="truncate">{current?.name ?? placeholder}</span>
        <ChevronsUpDown aria-hidden strokeWidth={1.9} className="size-3.5 shrink-0 text-tertiary" />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-labelledby={labelledBy} className="popover absolute right-0 top-[calc(100%+4px)] z-40 max-h-64 min-w-[200px] overflow-y-auto p-1">
          {profiles.map(p => (
            <li key={p.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={p.id === value}
                onClick={() => { onChange(p.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[14px] text-foreground hover:bg-accent hover:text-on-accent"
              >
                <Check aria-hidden strokeWidth={2.2} className={`size-3.5 shrink-0 ${p.id === value ? '' : 'invisible'}`} />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
