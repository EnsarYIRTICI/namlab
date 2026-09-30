"use client";
import { useState } from "react";
import Modal from "../Modal";

const HIZLI = [1, 2, 3, 4, 5, 6, 10, 12, 20, 24, 30, 50];

/** "Her okutmada miktar sor" açıkken: okutulan barkod için miktar girişi. */
export default function MiktarPenceresi({
  barkod,
  ad,
  onTamam,
  onIptal,
}: {
  barkod: string;
  ad?: string;
  onTamam: (miktar: number) => void;
  onIptal: () => void;
}) {
  const [v, setV] = useState("");
  const n = Number(v.replace(",", "."));
  const gecerli = /^\d{1,7}([.,]\d{1,3})?$/.test(v.trim()) && n > 0;
  return (
    <Modal
      baslik="Miktar"
      onClose={onIptal}
      onSubmit={(e) => {
        e.preventDefault();
        if (gecerli) onTamam(n);
      }}
    >
      <div>
        <div className="text-[18px] font-bold tabular-nums break-all">{barkod}</div>
        {ad && <div className="text-[13px] text-stone-500">{ad}</div>}
      </div>
      <input
        className="buyuk-giris"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
        inputMode="decimal"
        autoFocus
        placeholder="0"
        aria-label="Miktar"
      />
      <div className="hizli-miktar">
        {HIZLI.map((h) => (
          <button key={h} type="button" onClick={() => onTamam(h)}>
            {h}
          </button>
        ))}
      </div>
      <button className="anabtn" type="submit" disabled={!gecerli}>
        Ekle
      </button>
    </Modal>
  );
}
