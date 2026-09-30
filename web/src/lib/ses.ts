"use client";
/** Okutma geri bildirimi: kısa bip + titreşim. Listede olmayan ürün / hata için farklı ses. */
let ctx: AudioContext | null = null;

function ton(frekans: number, sure: number, baslangic = 0) {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = frekans;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    const t = ctx.currentTime + baslangic;
    o.start(t);
    o.stop(t + sure);
  } catch {
    /* ses yoksa sessiz geç */
  }
}

/** iOS sesi ancak bir dokunuştan sonra açar: ilk dokunuşta çağrılır. */
export function sesiHazirla() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
  } catch {}
}

export function bip(tur: "tamam" | "listedeYok" | "hata") {
  if (tur === "tamam") {
    ton(1800, 0.07);
    navigator.vibrate?.(40);
  } else if (tur === "listedeYok") {
    ton(1200, 0.07);
    ton(1200, 0.07, 0.11);
    navigator.vibrate?.([40, 60, 40]);
  } else {
    ton(300, 0.25);
    navigator.vibrate?.(250);
  }
}
