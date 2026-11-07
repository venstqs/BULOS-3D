import { Activity, Brain, Check, Cpu, Radio, RefreshCw, ShieldCheck } from 'lucide-react';

const LADDER = [
  ['Digital model', 'A 3D map or simulation. Updated by hand.', false],
  ['Digital shadow', 'Live data flows in, but nothing flows back.', false],
  ['Digital twin', 'Live data flows in, and the model’s decisions flow back to the real system.', true],
];

/** A digital twin is defined by its loop, so the loop is shown running, with live numbers. */
export default function TwinLoop({ live }) {
  const packets = live?.stations.reduce((a, s) => a + (s.link?.f_cnt ?? 0), 0);
  const age = live ? Math.max(0, Math.round((live.clock.t - Math.max(...live.stations.map((s) => s.link?.last_seen_t ?? 0))) / Math.max(1, live.clock.speed))) : null;
  const valves = live?.stations.filter((s) => s.valve) ?? [];
  const closed = valves.filter((s) => !s.valve.open).length;
  const watching = live?.stations.filter((s) => s.risk >= 0.25).length ?? 0;
  const commands = live?.events.filter((e) => e.type.startsWith('CMD_')).length ?? 0;
  const steps = [
    ['Sense', 'Sensor nodes measure the water at each point.', Radio, live ? `${live.stations.length} nodes · ${packets.toLocaleString()} packets` : '…'],
    ['Sync', 'Each packet updates the virtual watershed.', RefreshCw, live ? `Last update ${age} s ago` : '…'],
    ['Simulate', 'River physics runs forward from the current state.', Activity, live ? `4 h forecast · ${live.calibration.length} speed corrections` : '…'],
    ['Decide', 'Risk scoring and safety rules judge what to do.', Brain, live ? `${watching} of ${live.stations.length} points on watch` : '…'],
    ['Act', 'Commands return to valves, phones and work crews.', ShieldCheck, live ? `${closed} of ${valves.length} intakes closed · ${commands} recent commands` : '…'],
  ];
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>What makes this a digital twin</h2>
          <p className="mt-1 max-w-[78ch] text-sm text-ink-2">
            A digital twin is a virtual copy of a real system that stays in step with it through live data,
            uses physics to predict what happens next, and sends decisions back to change the real system.
            A 3D map alone is not a twin. The loop is what makes it one.
          </p>
        </div>
      </div>
      <div className="section-body">
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {steps.map(([name, what, Icon, metric], i) => (
            <li key={name} className="tile p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2f5be7] text-white"><Icon size={15} /></span>
                <span className="font-display text-sm font-semibold">{i + 1}. {name}</span>
              </div>
              <p className="mt-2 text-xs text-ink-2">{what}</p>
              <p className="mt-2 text-[12px] font-medium text-civic">{metric}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {LADDER.map(([name, what, here]) => (
            <div key={name} className={`rounded-xl border p-3 ${here ? 'border-[#2f5be7] bg-[#2f5be7]/5' : 'border-line'}`}>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {here && <Check size={15} className="text-[#2f5be7]" />}{name}
              </div>
              <p className="mt-1 text-xs text-ink-2">{what}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 flex gap-2 text-xs text-ink-2">
          <Cpu size={15} className="mt-px shrink-0 text-muted" />
          <span>
            <b className="font-semibold text-ink">Where Bulos 3D is today:</b> the full two-way loop runs against a simulated field
            that sends real-format sensor packets. The path for a real sensor node is built and tested with a software
            stand-in. A physical node has not been connected yet, so field accuracy is still unproven.
          </span>
        </p>
      </div>
    </section>
  );
}
