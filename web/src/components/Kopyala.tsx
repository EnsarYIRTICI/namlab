"use client";
import { useState } from "react";

async function panoya(metin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    // HTTP (güvenli olmayan bağlam) ya da eski tarayıcı: eski yöntem
    const t = document.createElement("textarea");
    t.value = metin;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

/** Tek dokunuşla kopyalama düğmesi; kopyalanınca kısa süre ✓ gösterir. */
export default function Kopyala({ metin, ad }: { metin: string; ad: string }) {
  const [oldu, setOldu] = useState(false);
  if (!metin) return null;
  return (
    <button
      type="button"
      className={"kopyala" + (oldu ? " oldu" : "")}
      title={`${ad} kopyala`}
      aria-label={`${ad} kopyala`}
      onClick={async () => {
        if (await panoya(metin)) {
          setOldu(true);
          setTimeout(() => setOldu(false), 1200);
        }
      }}
    >
      {oldu ? "✓" : "⧉"}
    </button>
  );
}
