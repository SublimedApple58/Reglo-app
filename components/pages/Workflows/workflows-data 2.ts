export type WorkflowItem = {
  id: string;
  title: string;
  owner: string;
  status: "Draft" | "Active" | "Paused" | "Review";
};

export const workflowsData: WorkflowItem[] = [
  {
    id: "intake-ordini",
    title: "Ricezione e registrazione ordini",
    owner: "Ops team",
    status: "Active",
  },
  {
    id: "onboarding-clienti",
    title: "Onboarding nuovi clienti",
    owner: "Customer Success",
    status: "Active",
  },
  {
    id: "verifica-crediti",
    title: "Verifica credito fornitori",
    owner: "Finance",
    status: "Review",
  },
  {
    id: "approvazione-capex",
    title: "Approvazione richieste CAPEX",
    owner: "CFO Office",
    status: "Draft",
  },
  {
    id: "gestione-richieste-it",
    title: "Gestione richieste IT interne",
    owner: "IT Service Desk",
    status: "Active",
  },
  {
    id: "onboarding-dipendenti",
    title: "Onboarding nuovi dipendenti",
    owner: "HR",
    status: "Paused",
  },
  {
    id: "validazione-documenti",
    title: "Validazione documenti legali",
    owner: "Legal",
    status: "Review",
  },
  {
    id: "controllo-qualita",
    title: "Controllo qualità produzione",
    owner: "Quality",
    status: "Active",
  },
  {
    id: "chiusura-ticket",
    title: "Chiusura ticket clienti premium",
    owner: "Supporto L2",
    status: "Active",
  },
  {
    id: "reportistica-mensile",
    title: "Reportistica mensile performance",
    owner: "Business Ops",
    status: "Draft",
  },
  {
    id: "aggiornamento-listini",
    title: "Aggiornamento listini fornitori",
    owner: "Procurement",
    status: "Review",
  },
  {
    id: "gestione-resi",
    title: "Gestione resi clienti e accrediti",
    owner: "Customer Care",
    status: "Active",
  },
  {
    id: "attivazione-utenze",
    title: "Attivazione utenze interne",
    owner: "IT Operations",
    status: "Active",
  },
  {
    id: "budgeting-quarter",
    title: "Budgeting quarterly e approvazioni",
    owner: "Finance",
    status: "Review",
  },
  {
    id: "controllo-accessi",
    title: "Controllo accessi badge e permessi",
    owner: "Facility",
    status: "Paused",
  },
  {
    id: "audit-compliance",
    title: "Audit compliance ISO",
    owner: "Compliance",
    status: "Draft",
  },
  {
    id: "distribuzione-notifiche",
    title: "Distribuzione notifiche di sistema",
    owner: "Platform",
    status: "Active",
  },
  {
    id: "aggiornamento-policy",
    title: "Aggiornamento policy interne",
    owner: "HR",
    status: "Review",
  },
  {
    id: "gestione-incidente",
    title: "Gestione incidenti critici",
    owner: "SRE",
    status: "Active",
  },
  {
    id: "archiviazione-contratti",
    title: "Archiviazione contratti clienti",
    owner: "Legal",
    status: "Active",
  },
  {
    id: "pianificazione-turni",
    title: "Pianificazione turni assistenza",
    owner: "Supporto",
    status: "Draft",
  },
  {
    id: "validazione-dati",
    title: "Validazione dati master",
    owner: "Data Team",
    status: "Review",
  },
  {
    id: "provisioning-ambiente",
    title: "Provisioning ambienti sandbox",
    owner: "DevOps",
    status: "Active",
  },
  {
    id: "chiusura-progetti",
    title: "Chiusura progetti e lesson learned",
    owner: "PMO",
    status: "Active",
  },
];
