export type WorkflowItem = {
  id: string;
  title: string;
  owner: string;
  status: "Draft" | "Active" | "Paused" | "Review";
  disabled?: boolean;
};

export const workflowsData: WorkflowItem[] = [
  {
    id: "intake-ordini",
    title: "Ricezione e registrazione ordini",
    owner: "Produzione",
    status: "Active",
  },
  {
    id: "onboarding-clienti",
    title: "Onboarding nuovi clienti",
    owner: "Team sales",
    status: "Active",
  },
  {
    id: "verifica-crediti",
    title: "Verifica credito fornitori",
    owner: "Amministrazione",
    status: "Review",
  },
  {
    id: "approvazione-capex",
    title: "Approvazione richieste CAPEX",
    owner: "Amministrazione",
    status: "Draft",
  },
  {
    id: "gestione-richieste-it",
    title: "Gestione richieste IT interne",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "onboarding-dipendenti",
    title: "Onboarding nuovi dipendenti",
    owner: "Amministrazione",
    status: "Paused",
  },
  {
    id: "validazione-documenti",
    title: "Validazione documenti legali",
    owner: "Amministrazione",
    status: "Review",
  },
  {
    id: "controllo-qualita",
    title: "Controllo qualità produzione",
    owner: "Produzione",
    status: "Active",
  },
  {
    id: "chiusura-ticket",
    title: "Chiusura ticket clienti premium",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "reportistica-mensile",
    title: "Reportistica mensile performance",
    owner: "Amministrazione",
    status: "Draft",
  },
  {
    id: "aggiornamento-listini",
    title: "Aggiornamento listini fornitori",
    owner: "Amministrazione",
    status: "Review",
  },
  {
    id: "gestione-resi",
    title: "Gestione resi clienti e accrediti",
    owner: "Team sales",
    status: "Active",
  },
  {
    id: "attivazione-utenze",
    title: "Attivazione utenze interne",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "budgeting-quarter",
    title: "Budgeting quarterly e approvazioni",
    owner: "Amministrazione",
    status: "Review",
  },
  {
    id: "controllo-accessi",
    title: "Controllo accessi badge e permessi",
    owner: "Produzione",
    status: "Paused",
  },
  {
    id: "audit-compliance",
    title: "Audit compliance ISO",
    owner: "Amministrazione",
    status: "Draft",
  },
  {
    id: "distribuzione-notifiche",
    title: "Distribuzione notifiche di sistema",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "aggiornamento-policy",
    title: "Aggiornamento policy interne",
    owner: "Amministrazione",
    status: "Review",
  },
  {
    id: "gestione-incidente",
    title: "Gestione incidenti critici",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "archiviazione-contratti",
    title: "Archiviazione contratti clienti",
    owner: "Amministrazione",
    status: "Active",
  },
  {
    id: "pianificazione-turni",
    title: "Pianificazione turni assistenza",
    owner: "Team sales",
    status: "Draft",
  },
  {
    id: "validazione-dati",
    title: "Validazione dati master",
    owner: "Team tech",
    status: "Review",
  },
  {
    id: "provisioning-ambiente",
    title: "Provisioning ambienti sandbox",
    owner: "Team tech",
    status: "Active",
  },
  {
    id: "chiusura-progetti",
    title: "Chiusura progetti e lesson learned",
    owner: "Amministrazione",
    status: "Active",
  },
];
