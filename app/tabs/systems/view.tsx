import { StatusLabel, ago, timeLabel, type State } from '@/components/home/ui';
import type { Systems } from './plugin';

const order: State[] = ['down', 'degraded', 'paused', 'unknown', 'up'];

function History({ h }: { h: (string | null)[] }) {
  return (
    <span className="sy-hist" role="img" aria-label={`Last 24 hours: ${h.filter((x) => x && x !== 'up').length} problem hours`}>
      {h.map((s, i) => <i key={i} className={s ? `h-${s}` : 'h-none'} />)}
    </span>
  );
}

export default function SystemsView({ data }: { data: Systems; fetchedAt: Date }) {
  const { counts, feed } = data;
  return (
    <main className="hd-page sy">
      <header className="hd-top">
        <h1>Systems</h1>
        <span className="hd-spacer" />
        {feed.present && !feed.stale
          ? <span className="hd-meta">Health feed updated {ago(feed.checkedAt!)}</span>
          : <span className="hd-chip stale">{feed.present ? 'Feed stale, showing probes' : 'No health feed yet, showing probes'}</span>}
        <span className="hd-meta">Probed {timeLabel(data.probedAt)}</span>
      </header>
      <p className="sy-summary">
        {order.filter((s: State) => counts[s]).map((s: State) => <span key={s}><StatusLabel state={s} /> <b className="num">{counts[s]}</b></span>)}
      </p>
      <section className="hd-panel sy-panel" aria-labelledby="sy-h">
        <div className="hd-ph"><h2 id="sy-h">Services</h2><span className="hd-meta">1 bar per hour, last 24 h</span></div>
        <table className="sy-table">
          <thead><tr><th>Service</th><th>State</th><th>Detail</th><th>History</th><th>Checked</th></tr></thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.id} className={`sy-${s.state}`}>
                <td><strong>{s.name}</strong><small>{s.reach || s.what}</small></td>
                <td><StatusLabel state={s.state as State} /></td>
                <td className="sy-detail">{s.detail}{s.source === 'probe' && feed.present ? <em> probe only</em> : null}</td>
                <td><History h={s.history} /></td>
                <td className="hd-faint num">{timeLabel(s.checkedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
