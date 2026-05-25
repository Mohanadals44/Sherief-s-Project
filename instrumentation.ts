export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadAll } = await import("./lib/scheduler");
  const { warmStartupChecks } = await import("./lib/agents/cursor");
  const { getExecutionMode } = await import("./lib/runtime");
  try {
    await loadAll();
  } catch (err) {
    console.error("[instrumentation] scheduler failed to load:", err);
  }
  try {
    const mode = await getExecutionMode();
    console.log(`[instrumentation] execution mode: ${mode}`);
  } catch (err) {
    console.warn("[instrumentation] mode detection threw:", err);
  }
  warmStartupChecks()
    .then((res) => {
      if (res.ok) console.log(`[instrumentation] ${res.message}`);
      else console.warn(`[instrumentation] ${res.message}`);
    })
    .catch((err) => console.warn("[instrumentation] warm check threw:", err));
}
