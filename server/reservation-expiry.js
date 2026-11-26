// One bounded sweep at startup and every minute. The database serializes workers.
function startReservationExpiry(pool, {interval=60000, log=console}={}) {
  let running=false;
  async function sweep() {
    if(running) return;
    running=true;
    try { await pool.query('SELECT uni_expire_reservations()'); }
    catch(e) { log.error('Reservation expiry:',e.code||e.name); }
    finally { running=false; }
  }
  void sweep();
  const timer=setInterval(sweep,interval);
  timer.unref();
  return ()=>clearInterval(timer);
}
module.exports={startReservationExpiry};
