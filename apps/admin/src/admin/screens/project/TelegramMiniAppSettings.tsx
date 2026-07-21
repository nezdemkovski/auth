import { SiTelegram } from "@icons-pack/react-simple-icons";
import { useEffect, useState } from "react";

import {
  Button,
  FormAlert,
  SettingsInput,
  StatusBadge
} from "@nezdemkovski/auth-ui";

import type {
  TelegramMiniAppConnection,
  TelegramMiniAppConnectionInput
} from "../../types";

export const TelegramMiniAppSettings = ({
  connection,
  loading,
  loadError,
  connectPending,
  disconnectPending,
  mutationError,
  onConnect,
  onDisconnect
}: {
  connection: TelegramMiniAppConnection | null;
  loading: boolean;
  loadError: boolean;
  connectPending: boolean;
  disconnectPending: boolean;
  mutationError: string | null;
  onConnect(input: TelegramMiniAppConnectionInput): Promise<void>;
  onDisconnect(): Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [botToken, setBotToken] = useState("");

  useEffect(() => {
    if (connection?.enabled) {
      setEditing(false);
      setBotToken("");
    }
  }, [connection]);

  if (loading) {
    return <div className="p-5 text-[13px] text-muted">Loading Telegram…</div>;
  }

  if (loadError) {
    return (
      <div className="p-5">
        <FormAlert>Could not load Telegram.</FormAlert>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await onConnect({ botUsername, botToken });
      setEditing(false);
      setBotToken("");
    } catch {
      // The mutation keeps the form open and shows the actionable error below.
    }
  };

  const disconnect = async () => {
    try {
      await onDisconnect();
      setConfirmDisconnect(false);
      setBotUsername("");
    } catch {
      // The mutation keeps confirmation visible and reports the error below.
    }
  };

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex max-w-[38rem] items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-ink">
            <SiTelegram size={21} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Telegram
              </h2>
              {connection?.enabled ? (
                <StatusBadge tone="success" label="Connected" />
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-5 text-muted">
              Sign people in automatically when they open this app from your
              Telegram bot.
            </p>
            {connection?.enabled && connection.botUsername ? (
              <p className="mt-2 text-[12.5px] font-medium text-ink-soft">
                @{connection.botUsername}
              </p>
            ) : null}
          </div>
        </div>

        {connection?.enabled ? (
          confirmDisconnect ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={disconnectPending}
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={disconnectPending}
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect
            </Button>
          )
        ) : !editing ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setEditing(true)}
          >
            Connect
          </Button>
        ) : null}
      </div>

      {!connection?.enabled && editing ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 border-t border-border pt-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsInput
              id="telegram-bot-username"
              label="Bot username"
              value={botUsername}
              placeholder="@my_app_bot"
              disabled={connectPending}
              autoComplete="off"
              onChange={setBotUsername}
            />
            <SettingsInput
              id="telegram-bot-token"
              label="Bot token"
              value={botToken}
              placeholder="Paste token"
              type="password"
              disabled={connectPending}
              autoComplete="off"
              onChange={setBotToken}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] leading-5 text-muted">
              Copy both values from{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline-offset-[3px] hover:underline"
              >
                @BotFather
              </a>
              . The token stays encrypted on the server.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={connectPending}
                onClick={() => {
                  setEditing(false);
                  setBotToken("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                loading={connectPending}
                disabled={!botUsername.trim() || !botToken.trim()}
              >
                Connect
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {mutationError ? <FormAlert>{mutationError}</FormAlert> : null}
    </div>
  );
};
