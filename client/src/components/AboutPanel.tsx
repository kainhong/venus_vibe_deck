export function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal about-panel">
        <div className="modal-header">
          <h2>关于</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body about-body">
          <div className="about-title">Venus Vibe Deck</div>
          <div className="about-meta">作者：Kain</div>
          <img className="about-qrcode" src="/about-qrcode.png" alt="公众号二维码" />
        </div>
      </div>
    </div>
  );
}
