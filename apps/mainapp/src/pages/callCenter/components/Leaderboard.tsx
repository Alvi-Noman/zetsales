import clsx from "clsx";
import type { CallCenterLeaderboardEntryDTO } from "@zetsales/shared";
import { RankedTable } from "../../../components/analytics/charts/RankedTable";
import { avatarFromName } from "../../../components/orders/avatar";
import { formatMinutes, formatPercent } from "../../../analytics/format";

export function Leaderboard({
  leaderboard,
}: {
  leaderboard: CallCenterLeaderboardEntryDTO[];
}) {
  return (
    <div className="zs-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Leaderboard</h2>
        <span className="text-xs text-slate-400">
          Ranked by orders confirmed in range
        </span>
      </div>
      <RankedTable
        columns={[
          {
            key: "rank",
            header: "#",
            render: (_row, i) => (
              <span className="font-semibold tabular-nums text-slate-400">
                {i + 1}
              </span>
            ),
          },
          {
            key: "agent",
            header: "Agent",
            render: (row) => {
              const name = row.email.split("@")[0];
              const avatar = avatarFromName(name);
              return (
                <div className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white",
                      avatar.color,
                    )}
                  >
                    {avatar.initials}
                  </div>
                  <span className="font-medium text-slate-700">{name}</span>
                </div>
              );
            },
          },
          {
            key: "confirmed",
            header: "Confirmed",
            align: "right",
            render: (row) => (
              <span className="font-semibold text-emerald-600">
                {row.confirmedCount}
              </span>
            ),
          },
          {
            key: "avgConfirm",
            header: "Avg time to confirm",
            align: "right",
            render: (row) => formatMinutes(row.avgTimeToConfirmMinutes),
          },
          {
            key: "delivered",
            header: "Delivered rate (all-time)",
            align: "right",
            render: (row) =>
              row.deliveredRate != null
                ? formatPercent(row.deliveredRate)
                : "—",
          },
          {
            key: "score",
            header: "Composite score",
            align: "right",
            render: (row) => (
              <span className="font-semibold text-slate-800">
                {row.compositeScore ?? "—"}
              </span>
            ),
          },
        ]}
        rows={leaderboard}
        keyField={(row) => row.email}
        emptyLabel="No confirmations logged for this range"
      />
    </div>
  );
}
