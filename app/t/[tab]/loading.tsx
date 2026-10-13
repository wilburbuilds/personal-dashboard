export default function Loading() {
  return (
    <div className="hd-page" aria-busy="true" aria-label="Loading">
      <div className="hd-top"><span className="hd-skel" style={{ width: 160, height: 30 }} /></div>
      <div className="hd-grid">
        <div className="hd-panel s8"><span className="hd-skel" style={{ height: 320 }} /></div>
        <div className="hd-panel s4"><span className="hd-skel" style={{ height: 320 }} /></div>
      </div>
    </div>
  );
}
