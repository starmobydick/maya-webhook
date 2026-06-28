// Lightweight liveness probe — point UptimeRobot / BetterStack at this.
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "maya-webhook",
    time: new Date().toISOString(),
  });
}
