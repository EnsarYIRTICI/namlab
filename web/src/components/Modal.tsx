"use client";
import { useEffect } from "react";

/** Ortak pencere kabuğu: Esc ve dışarı tıklama kapatır. */
export default function Modal({
  baslik,
  onClose,
  onSubmit,
  genis,
  children,
}: {
  baslik: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  genis?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = eski;
    };
  }, [onClose]);

  return (
    <div className="modal-arka" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={"modal" + (genis ? " genis" : "")} role="dialog" aria-modal="true" aria-label={baslik} onSubmit={onSubmit}>
        <div className="modal-ust">
          <h2>{baslik}</h2>
          <button type="button" className="viewer-kapat" aria-label="Kapat" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}
