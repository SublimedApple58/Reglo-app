/**
 * Guardia pre-migrazione: `DIRECT_URL` non deve passare dal pooler Neon.
 *
 * Perché esiste. `prisma migrate` prende un **advisory lock di sessione**
 * (`pg_advisory_lock(72707369)`) per impedire due migrazioni in parallelo. Il
 * pooler di Neon è pgbouncer in *transaction pooling*: lo stato di sessione non
 * appartiene al client ma alla connessione *server* che ha eseguito lo
 * statement. Finita la transazione quella connessione torna nel pool
 * portandosi dietro il lock, e l'`unlock` di Prisma finisce su un'altra
 * connessione: il lock resta appeso per sempre su un backend che intanto serve
 * traffico dell'app. La migrazione successiva — di chiunque — si pianta con
 * **P1002**.
 *
 * È esattamente il motivo per cui il datasource Prisma ha `directUrl` accanto a
 * `url`: `url` va al pooler (tante connessioni corte dall'app), `directUrl`
 * all'endpoint diretto (poche connessioni lunghe, stato di sessione stabile).
 *
 * Il trabocchetto: la dashboard Neon propone l'URL **pooled** come "connection
 * string" di default, quindi chi rigenera le credenziali lo incolla in
 * entrambe le variabili senza accorgersene. È già successo su `.env.prod`
 * (19/09/2026). Questa guardia lo intercetta prima della migrazione invece che
 * dopo, quando il lock è già appeso in produzione.
 */

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const envFile = process.env.DOTENV_CONFIG_PATH ?? "(env non dichiarato)";

const fail = (message, hint) => {
  console.error(`\n❌ ${message}\n`);
  console.error(hint);
  console.error(
    "\n   Il pooler va bene per DATABASE_URL (l'app), mai per DIRECT_URL (le migrazioni):",
  );
  console.error("   l'advisory lock di `prisma migrate` resterebbe appeso su una");
  console.error("   connessione riciclata dal pool e bloccherebbe la migrazione dopo (P1002).\n");
  process.exit(1);
};

if (!directUrl) {
  fail(
    `DIRECT_URL non è impostata in ${envFile}.`,
    "   Aggiungila puntando all'endpoint DIRETTO di Neon (host senza '-pooler').",
  );
}

// L'host del pooler Neon è lo stesso dell'endpoint diretto col suffisso
// '-pooler' sul primo segmento: ep-nome-1234-pooler.<regione>.aws.neon.tech
if (/-pooler\./.test(directUrl)) {
  fail(
    `DIRECT_URL punta al POOLER in ${envFile}.`,
    "   Togli '-pooler' dall'host: ep-xxx-pooler.<regione>… → ep-xxx.<regione>…",
  );
}

if (databaseUrl && directUrl === databaseUrl) {
  fail(
    `DIRECT_URL e DATABASE_URL sono identiche in ${envFile}.`,
    "   DIRECT_URL deve usare l'endpoint diretto, DATABASE_URL il pooler.",
  );
}

console.log(`✓ DIRECT_URL usa l'endpoint diretto (${envFile})`);
