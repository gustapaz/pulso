import { render } from "solid-js/web";
import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  For,
  Index,
  Show,
} from "solid-js";
import {
  instruments,
  presets,
  fromPreset,
  sanitize,
  type Session,
  type Preset,
} from "./model";
import { Engine, renderWav } from "./audio";
import "./style.css";

type Saved = { id: string; date: string; session: Session };
const engine = new Engine();
function App() {
  const [session, setSession] = createSignal<Session>(fromPreset(presets[0]));
  const [playing, setPlaying] = createSignal(false),
    [starting, setStarting] = createSignal(false),
    [step, setStep] = createSignal(-1);
  const [selected, setSelected] = createSignal("concreto"),
    [mixer, setMixer] = createSignal(false);
  const [saved, setSaved] = createSignal<Saved[]>([]),
    [message, setMessage] = createSignal(""),
    [filter, setFilter] = createSignal("TODOS");
  const [dialog, setDialog] = createSignal<
      "help" | "save" | "export" | "clear" | "delete" | null
    >(null),
    [draft, setDraft] = createSignal(""),
    [target, setTarget] = createSignal(""),
    [bars, setBars] = createSignal(4),
    [exporting, setExporting] = createSignal(false);
  let modal!: HTMLDialogElement,
    fileInput!: HTMLInputElement,
    opener: HTMLElement | null = null,
    toastTimer: ReturnType<typeof setTimeout>,
    ready = false;
  const notify = (text: string) => {
    setMessage(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setMessage(""), 5500);
  };
  const update = (patch: Partial<Session>) =>
    setSession((s) => ({ ...s, ...patch }));
  const trackUpdate = (
    index: number,
    patch: Partial<Session["tracks"][number]>,
  ) =>
    setSession((s) => ({
      ...s,
      tracks: s.tracks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  const stop = () => {
    engine.stop();
    setPlaying(false);
    setStep(-1);
  };
  async function play() {
    if (starting()) return;
    if (playing()) {
      stop();
      return;
    }
    setStarting(true);
    try {
      await engine.start(session, setStep);
      setPlaying(true);
    } catch {
      notify(
        "Não foi possível iniciar o áudio. Verifique o suporte do navegador e tente novamente.",
      );
    } finally {
      setStarting(false);
    }
  }
  async function audition(index: number) {
    try {
      await engine.init();
      engine.hit(index, session());
    } catch {
      notify("O áudio não está disponível neste navegador.");
    }
  }
  function toggle(index: number, n: number) {
    const t = session().tracks[index];
    trackUpdate(index, { steps: t.steps.map((v, i) => (i === n ? !v : v)) });
    setSelected("");
  }
  function choose(p: Preset) {
    stop();
    setSession(fromPreset(p));
    setSelected(p.id);
    notify(`Groove ${p.name} carregado. Pode transformar.`);
  }
  function open(
    kind: NonNullable<ReturnType<typeof dialog>>,
    trigger?: HTMLElement,
  ) {
    opener = trigger ?? (document.activeElement as HTMLElement);
    setDialog(kind);
    modal.showModal();
  }
  function close() {
    if (exporting()) return;
    modal.close();
    setDialog(null);
    opener?.isConnected && opener.focus();
  }
  function save() {
    const name = draft().trim();
    if (!name) return;
    const entry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      session: sanitize({ ...session(), name }),
    };
    const list = [entry, ...saved()].slice(0, 30);
    try {
      localStorage.setItem("pulso-library", JSON.stringify(list));
      setSaved(list);
      update({ name });
      close();
      notify("Sessão salva neste dispositivo.");
    } catch {
      notify(
        "Não foi possível salvar. Seu armazenamento pode estar cheio. Exporte um JSON para guardar a sessão.",
      );
    }
  }
  function remove() {
    const list = saved().filter((s) => s.id !== target());
    try {
      localStorage.setItem("pulso-library", JSON.stringify(list));
      setSaved(list);
      close();
      notify("Sessão removida da biblioteca.");
    } catch {
      notify("Não foi possível alterar a biblioteca neste navegador.");
    }
  }
  function download(data: BlobPart, type: string, name: string) {
    const blob = new Blob([data], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filename = () =>
    session()
      .name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "minha-sessao";
  async function exportAudio() {
    setExporting(true);
    try {
      const data = await renderWav(sanitize(session()), bars());
      download(data, "audio/wav", `pulso-${filename()}.wav`);
      setExporting(false);
      close();
      notify("WAV pronto. O download foi iniciado.");
    } catch {
      setExporting(false);
      notify(
        "Não foi possível gerar o áudio. Tente novamente ou exporte o projeto em JSON.",
      );
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100000)
        throw new Error(
          "Arquivo muito grande. Use um JSON do Pulso com até 100 KB.",
        );
      const data = sanitize(JSON.parse(await file.text()));
      stop();
      setSession(data);
      setSelected("");
      notify("Sessão importada. Tudo pronto para tocar.");
    } catch (e) {
      notify(
        e instanceof SyntaxError
          ? "O arquivo não contém um JSON válido."
          : e instanceof Error
            ? e.message
            : "Não foi possível importar a sessão.",
      );
    } finally {
      fileInput.value = "";
    }
  }
  let taps: number[] = [];
  function tap() {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 3000);
    taps.push(now);
    if (taps.length >= 2) {
      const bpm = Math.round(60000 / ((now - taps[0]) / (taps.length - 1)));
      if (bpm >= 60 && bpm <= 180) {
        update({ bpm });
        notify(`Tempo ajustado para ${bpm} BPM.`);
      }
    }
  }
  function keys(e: KeyboardEvent) {
    const element = e.target as HTMLElement;
    if (
      element.closest("input,select,textarea,button,a,dialog") ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.code === "Space") {
      e.preventDefault();
      void play();
    }
    const n = ["1", "2", "3", "4"].indexOf(e.key);
    if (n >= 0) void audition(n);
  }
  onMount(() => {
    try {
      const draft = localStorage.getItem("pulso-draft");
      if (draft) {
        setSession(sanitize(JSON.parse(draft)));
        setSelected("");
      }
      const list = JSON.parse(localStorage.getItem("pulso-library") || "[]");
      if (!Array.isArray(list)) throw new Error();
      setSaved(
        list
          .slice(0, 30)
          .filter(
            (x: Saved) =>
              typeof x.id === "string" && typeof x.date === "string",
          )
          .map((x: Saved) => ({ ...x, session: sanitize(x.session) })),
      );
    } catch {
      notify(
        "Alguns dados locais não puderam ser recuperados. Você pode continuar criando.",
      );
    }
    ready = true;
    window.addEventListener("keydown", keys);
    document.addEventListener("visibilitychange", visibility);
  });
  function visibility() {
    if (document.hidden) stop();
  }
  createEffect(() => {
    const data = JSON.stringify(session());
    if (ready) {
      try {
        localStorage.setItem("pulso-draft", data);
      } catch {
        /* Explicit save reports storage failures; editing remains usable. */
      }
    }
  });
  createEffect(() => {
    if (dialog()) {
      queueMicrotask(() => {
        (
          modal.querySelector("input,button,select") as HTMLElement | null
        )?.focus();
      });
    }
  });
  onCleanup(() => {
    engine.dispose();
    window.removeEventListener("keydown", keys);
    document.removeEventListener("visibilitychange", visibility);
    clearTimeout(toastTimer);
  });
  const count = () =>
    session().tracks.reduce(
      (sum, t) => sum + t.steps.filter(Boolean).length,
      0,
    );
  return (
    <>
      <a class="skip" href="#studio">
        Pular para o sequenciador
      </a>
      <header class="site-header">
        <a class="brand" href="#" aria-label="Pulso, início">
          <span aria-hidden="true">ϟ</span> pulso<span class="dot">.</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#studio">Estúdio</a>
          <a href="#grooves">Grooves</a>
          <a href="#sessoes">
            Sessões <span>{saved().length.toString().padStart(2, "0")}</span>
          </a>
        </nav>
        <button
          class="help-button"
          onClick={(e) => open("help", e.currentTarget)}
          aria-label="Como usar o Pulso"
        >
          ? <span>Como funciona</span>
        </button>
      </header>
      <main>
        <section class="intro" aria-labelledby="title">
          <div class="intro-line">
            <p>
              <span class="live-dot" /> SEU LABORATÓRIO DE RITMOS
            </p>
            <p>
              FEITO PARA EXPERIMENTAR <span aria-hidden="true">↘</span>
            </p>
          </div>
          <div class="title-line">
            <h1 id="title">
              Menos regras.
              <br />
              <span>Mais ritmo.</span>
            </h1>
            <div class="orbit" aria-hidden="true">
              <div class="orbit-ring" />
              <span>
                16
                <br />
                <small>
                  PASSOS.
                  <br />
                  SEU UNIVERSO.
                </small>
              </span>
              <i>✳</i>
            </div>
          </div>
          <div class="intro-bottom">
            <p>
              O próximo beat é seu.
              <br />
              <span>Desenhe, escute, repita. Sem precisar saber teoria.</span>
            </p>
            <a href="#studio" class="text-link">
              Entre no ritmo <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>
        <section
          class="studio"
          id="studio"
          aria-labelledby="studio-title"
          tabindex="-1"
        >
          <div class="section-cap">
            <p>
              <span class="index">01 /</span> PLAYGROUND
            </p>
            <p class="mono">
              <span classList={{ "live-dot": true, "is-playing": playing() }} />
              {playing() ? "NO AR" : "PRONTO PARA TOCAR"}
            </p>
          </div>
          <div class="transport">
            <div class="session-title">
              <span class="eyebrow">SESSÃO ATUAL</span>
              <h2 id="studio-title">
                {session().name}
                <span class="tiny-star" aria-hidden="true">
                  ✳
                </span>
              </h2>
              <span class="session-details">
                4 pistas <b>·</b> 16 passos <b>·</b> {count()} notas
              </span>
            </div>
            <div class="transport-controls">
              <label class="tempo">
                <span class="eyebrow">BPM</span>
                <input
                  aria-label="Tempo em BPM"
                  type="number"
                  min="60"
                  max="180"
                  value={session().bpm}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n) && n >= 60 && n <= 180)
                      update({ bpm: Math.round(n) });
                    else {
                      e.currentTarget.value = String(session().bpm);
                      notify("Escolha um tempo entre 60 e 180 BPM.");
                    }
                  }}
                />
              </label>
              <button
                class="tap"
                onClick={tap}
                title="Toque no seu ritmo para calcular o BPM"
              >
                TAP
                <br />
                <span>TEMPO</span>
              </button>
              <button
                class="play"
                aria-label={
                  playing() ? "Pausar reprodução" : "Iniciar reprodução"
                }
                aria-pressed={playing()}
                disabled={starting()}
                onClick={play}
              >
                <span aria-hidden="true">{playing() ? "Ⅱ" : "▶"}</span>
              </button>
            </div>
          </div>
          <div
            class="scope"
            classList={{ running: playing() }}
            aria-hidden="true"
          >
            <span class="scope-label">PULSO / SIGNAL</span>
            <div class="wave">
              <For each={Array.from({ length: 93 }, (_, i) => i)}>
                {(i) => (
                  <i
                    style={{
                      height: `${8 + Math.sin(i * 0.47) ** 2 * 37 + Math.sin(i * 0.19) ** 4 * 44}%`,
                      "--delay": `${(i % 9) * -0.08}s`,
                    }}
                    classList={{ lit: playing() && i % 16 === step() }}
                  />
                )}
              </For>
            </div>
            <span class="scope-time">
              {playing() ? (step() + 1).toString().padStart(2, "0") : "—"}
              <small> / 16</small>
            </span>
          </div>
          <p class="mobile-hint">
            Deslize a grade para ver todos os passos{" "}
            <span aria-hidden="true">↔</span>
          </p>
          <div
            class="sequencer-scroll"
            role="region"
            aria-label="Sequenciador de 16 passos, role horizontalmente em telas pequenas"
            tabindex="0"
          >
            <div class="sequencer">
              <div class="steps-header">
                <span>INSTRUMENTO</span>
                <For each={Array.from({ length: 16 }, (_, i) => i)}>
                  {(i) => (
                    <span
                      classList={{ beat: i % 4 === 0, current: step() === i }}
                    >
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                  )}
                </For>
                <span>PISTA</span>
              </div>
              <For each={instruments}>
                {(instrument, index) => (
                  <div
                    class="track"
                    style={{ "--track-color": instrument.color }}
                  >
                    <button
                      class="instrument"
                      onClick={() => audition(index())}
                      aria-label={`Ouvir ${instrument.name}`}
                    >
                      <span class="instrument-code">{instrument.code}</span>
                      <span>
                        {instrument.name}
                        <small>
                          0{index() + 1} <span aria-hidden="true">↗</span>
                        </small>
                      </span>
                    </button>
                    <Index each={session().tracks[index()].steps}>
                      {(active, n) => (
                        <button
                          class="step"
                          classList={{
                            active: active(),
                            quarter: n % 4 === 0,
                            playing: playing() && step() === n,
                            muted: session().tracks[index()].muted,
                          }}
                          aria-label={`${instrument.name}, passo ${n + 1}`}
                          aria-pressed={active()}
                          onClick={() => toggle(index(), n)}
                        >
                          <span aria-hidden="true">{active() ? "●" : "·"}</span>
                        </button>
                      )}
                    </Index>
                    <div class="track-actions">
                      <button
                        aria-label={`Silenciar ${instrument.name}`}
                        aria-pressed={session().tracks[index()].muted}
                        classList={{ engaged: session().tracks[index()].muted }}
                        onClick={() =>
                          trackUpdate(index(), {
                            muted: !session().tracks[index()].muted,
                          })
                        }
                      >
                        M
                      </button>
                      <button
                        aria-label={`Solo ${instrument.name}`}
                        aria-pressed={session().tracks[index()].solo}
                        classList={{ engaged: session().tracks[index()].solo }}
                        onClick={() =>
                          trackUpdate(index(), {
                            solo: !session().tracks[index()].solo,
                          })
                        }
                      >
                        S
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
          <div class="studio-tools">
            <div>
              <button
                class="tool"
                aria-expanded={mixer()}
                aria-controls="mixer"
                onClick={() => setMixer(!mixer())}
              >
                <span aria-hidden="true">☷</span> Mixer{" "}
                <span aria-hidden="true">{mixer() ? "−" : "+"}</span>
              </button>
              <button
                class="tool muted-text"
                onClick={(e) => open("clear", e.currentTarget)}
              >
                Limpar grade
              </button>
            </div>
            <div>
              <button
                class="tool"
                onClick={(e) => {
                  setDraft(session().name);
                  open("save", e.currentTarget);
                }}
              >
                Salvar sessão <span aria-hidden="true">↗</span>
              </button>
              <button
                class="export-button"
                onClick={(e) => open("export", e.currentTarget)}
              >
                Exportar <span aria-hidden="true">↓</span>
              </button>
            </div>
          </div>
          <Show when={mixer()}>
            <div class="mixer" id="mixer">
              <For each={instruments}>
                {(instrument, index) => (
                  <label style={{ "--track-color": instrument.color }}>
                    <span>
                      {instrument.name}
                      <output>{session().tracks[index()].volume}%</output>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={session().tracks[index()].volume}
                      aria-label={`Volume ${instrument.name}`}
                      onInput={(e) =>
                        trackUpdate(index(), {
                          volume: Number(e.currentTarget.value),
                        })
                      }
                    />
                  </label>
                )}
              </For>
              <label>
                <span>
                  Swing<output>{session().swing}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={session().swing}
                  aria-label="Swing"
                  onInput={(e) =>
                    update({ swing: Number(e.currentTarget.value) })
                  }
                />
              </label>
              <label>
                <span>
                  Master<output>{session().master}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={session().master}
                  aria-label="Volume master"
                  onInput={(e) =>
                    update({ master: Number(e.currentTarget.value) })
                  }
                />
              </label>
            </div>
          </Show>
          <div class="studio-footnote">
            <span>
              <span class="live-dot" /> ÁUDIO GERADO AQUI. A CRIATIVIDADE
              TAMBÉM.
            </span>
            <span>
              <kbd>espaço</kbd> play / pausa <b>·</b> <kbd>1</kbd>—<kbd>4</kbd>{" "}
              ouvir pistas
            </span>
          </div>
        </section>
        <section class="grooves" id="grooves" aria-labelledby="grooves-title">
          <div class="section-cap">
            <p>
              <span class="index">02 /</span> PONTOS DE PARTIDA
            </p>
            <span class="mono">EXPLORE. DESMONTE. REINVENTE.</span>
          </div>
          <div class="section-heading">
            <h2 id="grooves-title">
              Encontre sua
              <br />
              <em>frequência.</em>
            </h2>
            <div>
              <p>
                Um groove é só o começo.
                <br />
                Escolha uma base e faça do seu jeito.
              </p>
              <label class="filter-label">
                Filtrar estilo
                <select
                  value={filter()}
                  onChange={(e) => setFilter(e.currentTarget.value)}
                >
                  <option value="TODOS">Todos os estilos</option>
                  <For each={[...new Set(presets.map((p) => p.genre))]}>
                    {(genre) => <option value={genre}>{genre}</option>}
                  </For>
                </select>
              </label>
            </div>
          </div>
          <div class="groove-list">
            <For
              each={presets.filter(
                (p) => filter() === "TODOS" || p.genre === filter(),
              )}
            >
              {(p) => (
                <button
                  class="groove-row"
                  classList={{ selected: selected() === p.id }}
                  onClick={() => choose(p)}
                  aria-label={`Carregar groove ${p.name}`}
                  aria-pressed={selected() === p.id}
                >
                  <span class="groove-number">0{presets.indexOf(p) + 1}</span>
                  <span class="groove-name">
                    {p.name}
                    <small>{p.description}</small>
                  </span>
                  <span class="mini-pattern" aria-hidden="true">
                    <For each={Array.from({ length: 16 }, (_, i) => i)}>
                      {(i) => (
                        <i
                          classList={{ on: p.hits.some((h) => h.includes(i)) }}
                        />
                      )}
                    </For>
                  </span>
                  <span class="genre">{p.genre}</span>
                  <span class="groove-bpm">
                    {p.bpm}
                    <small>BPM</small>
                  </span>
                  <span class="row-arrow" aria-hidden="true">
                    {selected() === p.id ? "✓" : "↗"}
                  </span>
                </button>
              )}
            </For>
          </div>
          <p class="replace-note">
            Carregar um groove substitui a grade atual. Salve sua sessão antes
            de explorar.
          </p>
        </section>
        <section class="sessions" id="sessoes" aria-labelledby="sessions-title">
          <div class="section-cap">
            <p>
              <span class="index">03 /</span> SUAS IDEIAS, GUARDADAS
            </p>
            <span class="mono">NESTE DISPOSITIVO</span>
          </div>
          <div class="saved-heading">
            <h2 id="sessions-title">O som fica.</h2>
            <button class="tool" onClick={() => fileInput.click()}>
              Importar sessão <span aria-hidden="true">↑</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Arquivo de sessão"
              onChange={(e) => importFile(e.currentTarget.files?.[0])}
            />
          </div>
          <Show
            when={saved().length}
            fallback={
              <div class="empty-library">
                <span class="empty-symbol" aria-hidden="true">
                  ↳
                </span>
                <div>
                  <h3>Todo ritmo merece uma segunda escuta.</h3>
                  <p>Salve sua primeira sessão no estúdio. Ela aparece aqui.</p>
                </div>
                <button
                  class="round-link"
                  aria-label="Salvar primeira sessão"
                  onClick={(e) => {
                    setDraft(session().name);
                    open("save", e.currentTarget);
                  }}
                >
                  +
                </button>
              </div>
            }
          >
            <div class="saved-list">
              <For each={saved()}>
                {(entry) => (
                  <div class="saved-row">
                    <span class="saved-icon" aria-hidden="true">
                      ≋
                    </span>
                    <div>
                      <h3>{entry.session.name}</h3>
                      <p>
                        {entry.session.bpm} BPM <span>·</span>{" "}
                        {new Date(entry.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <button
                      class="tool"
                      aria-label={`Abrir sessão ${entry.session.name}`}
                      onClick={() => {
                        stop();
                        setSession(sanitize(entry.session));
                        setSelected("");
                        notify(
                          `Sessão ${entry.session.name} carregada no estúdio.`,
                        );
                        document.getElementById("studio")?.scrollIntoView({
                          behavior: matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "instant"
                            : "smooth",
                        });
                      }}
                    >
                      Abrir <span aria-hidden="true">↗</span>
                    </button>
                    <button
                      class="remove"
                      aria-label={`Excluir sessão ${entry.session.name}`}
                      onClick={(e) => {
                        setTarget(entry.id);
                        open("delete", e.currentTarget);
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <p class="library-note">
            Sem conta, sem nuvem. Exporte o projeto em JSON para levar sua
            sessão a outro dispositivo. Até 30 sessões salvas; ao ultrapassar, a
            mais antiga sai da biblioteca.
          </p>
        </section>
        <section class="manifesto" aria-label="Manifesto Pulso">
          <span>OUÇA A SUA CURIOSIDADE.</span>
          <p>
            Não precisa de um estúdio.
            <br />
            Só de um primeiro <em>toque.</em>
          </p>
          <a href="#studio" aria-label="Voltar ao estúdio">
            ↑
          </a>
        </section>
      </main>
      <footer>
        <a href="#" class="brand">
          ϟ pulso.
        </a>
        <p>Um experimento sonoro de Gustavo Paz.</p>
        <div>
          <span>FEITO NO NAVEGADOR</span>
          <a
            href="https://github.com/gustapaz/pulso"
            target="_blank"
            rel="noreferrer"
          >
            Código aberto ↗
          </a>
        </div>
      </footer>
      <div class="toast" role="status" classList={{ visible: !!message() }}>
        {message()}
      </div>
      <dialog
        ref={modal}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === modal) {
            const r = modal.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              close();
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const elements = Array.from(
            modal.querySelectorAll<HTMLElement>(
              "button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]",
            ),
          ).filter((el) => el.offsetParent !== null);
          const first = elements[0],
            last = elements.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        aria-labelledby="modal-title"
      >
        <button
          class="modal-close"
          aria-label="Fechar janela"
          disabled={exporting()}
          onClick={close}
        >
          ×
        </button>
        <Show when={dialog() === "help"}>
          <span class="eyebrow">MANUAL PARA NÃO SEGUIR REGRAS</span>
          <h2 id="modal-title">Dê o primeiro play.</h2>
          <div class="help-steps">
            <p>
              <b>01</b>
              <span>
                <strong>Desenhe o ritmo.</strong> Cada quadrado é um passo.
                Clique para ativar ou remover uma nota. Os grupos de quatro
                formam as batidas do compasso.
              </span>
            </p>
            <p>
              <b>02</b>
              <span>
                <strong>Encontre o balanço.</strong> Ajuste o BPM para mudar a
                velocidade. No mixer, o swing atrasa os passos pares, criando
                uma sensação mais solta.
              </span>
            </p>
            <p>
              <b>03</b>
              <span>
                <strong>Escute os detalhes.</strong> M silencia uma pista. S
                deixa só as pistas em solo. Clique no nome de um instrumento
                para ouvir seu som.
              </span>
            </p>
            <p>
              <b>04</b>
              <span>
                <strong>Leve seu som.</strong> Salve no dispositivo, exporte o
                WAV ou baixe um JSON para continuar em outro navegador.
              </span>
            </p>
          </div>
          <p class="modal-note">
            Use volume moderado. Espaço inicia ou pausa quando o foco não está
            em um controle. As teclas 1 a 4 tocam os instrumentos. A reprodução
            pausa ao sair desta aba.
          </p>
          <button class="primary" onClick={close}>
            Bora experimentar ↗
          </button>
        </Show>
        <Show when={dialog() === "save"}>
          <span class="eyebrow">UMA IDEIA PARA VOLTAR DEPOIS</span>
          <h2 id="modal-title">Dê um nome ao som.</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label class="field-label">
              Nome da sessão
              <input
                required
                maxlength="40"
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                placeholder="Meu próximo beat"
              />
            </label>
            <p class="modal-note">
              A sessão fica salva apenas neste navegador. Exporte um JSON para
              manter uma cópia fora dele.
            </p>
            <button class="primary" type="submit" disabled={!draft().trim()}>
              Salvar neste dispositivo ↗
            </button>
          </form>
        </Show>
        <Show when={dialog() === "export"}>
          <span class="eyebrow">DO NAVEGADOR PARA O MUNDO</span>
          <h2 id="modal-title">Seu beat, com você.</h2>
          <label class="field-label">
            Duração do áudio
            <select
              value={bars()}
              onChange={(e) => setBars(Number(e.currentTarget.value))}
            >
              <option value="1">1 compasso</option>
              <option value="4">4 compassos</option>
              <option value="8">8 compassos</option>
              <option value="16">16 compassos</option>
            </select>
          </label>
          <p class="modal-note">
            WAV mono, 44,1 kHz, 16 bits. Inclui volumes, mute, solo e swing.
            Cerca de {((bars() * 240) / session().bpm).toFixed(1)} segundos,
            mais a cauda do som.
          </p>
          <button class="primary" onClick={exportAudio} disabled={exporting()}>
            {exporting() ? "Gerando seu áudio…" : "Baixar áudio WAV ↓"}
          </button>
          <button
            class="secondary"
            disabled={exporting()}
            onClick={() => {
              download(
                JSON.stringify(session(), null, 2),
                "application/json",
                `pulso-${filename()}.json`,
              );
              notify(
                "Projeto JSON exportado. Importe na seção de sessões para continuar.",
              );
            }}
          >
            Baixar projeto JSON ↓
          </button>
        </Show>
        <Show when={dialog() === "clear"}>
          <span class="eyebrow">RECOMEÇAR TAMBÉM É CRIAR</span>
          <h2 id="modal-title">Abrir espaço?</h2>
          <p class="modal-note">
            As notas da grade atual serão removidas. Suas sessões salvas ficam
            na biblioteca. Salve antes de continuar se quiser preservar este
            ritmo.
          </p>
          <button
            class="primary"
            onClick={() => {
              stop();
              setSession((s) => ({
                ...s,
                tracks: s.tracks.map((t) => ({
                  ...t,
                  steps: Array(16).fill(false),
                })),
              }));
              setSelected("");
              close();
              notify("Grade limpa. O próximo ritmo é seu.");
            }}
          >
            Sim, limpar as notas
          </button>
          <button class="secondary" onClick={close}>
            Continuar editando
          </button>
        </Show>
        <Show when={dialog() === "delete"}>
          <span class="eyebrow">BIBLIOTECA LOCAL</span>
          <h2 id="modal-title">Remover esta sessão?</h2>
          <p class="modal-note">
            “{saved().find((s) => s.id === target())?.session.name}” será
            removida da biblioteca deste navegador. A grade atual continua
            disponível.
          </p>
          <button class="primary" onClick={remove}>
            Remover da biblioteca
          </button>
          <button class="secondary" onClick={close}>
            Manter sessão
          </button>
        </Show>
      </dialog>
    </>
  );
}
render(() => <App />, document.getElementById("root")!);
