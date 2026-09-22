"use client";

import React from "react";

import { getAutoscuolaSettings } from "@/lib/actions/autoscuole-settings.actions";
import {
  DEFAULT_STUDENT_NAME_ORDER,
  type StudentNameOrder,
} from "@/lib/autoscuole/student-name-order";

/**
 * L'ordine con cui si scrive il nome degli allievi, letto **una volta sola** per
 * sessione (REG-507).
 *
 * Nasce dal QA: il setting tocca una decina di schermate — agenda, allievi,
 * pratiche, fatturazione, scadenze, pagamenti, dialoghi. Farlo leggere a ognuna
 * per conto suo significherebbe dieci fetch e, soprattutto, dieci occasioni di
 * disallinearsi. `getAutoscuolaSettings` è in cache Redis, ma la cache non
 * impedisce a due schermate di leggerla in momenti diversi e mostrare ordini
 * diversi nella stessa pagina.
 *
 * Il default è il comportamento storico, quindi finché la risposta non arriva
 * (o se fallisce) non si vede niente di strano: si vede "Nome Cognome".
 */
const StudentNameOrderContext = React.createContext<StudentNameOrder>(
  DEFAULT_STUDENT_NAME_ORDER,
);

export function StudentNameOrderProvider({ children }: { children: React.ReactNode }) {
  const [order, setOrder] = React.useState<StudentNameOrder>(DEFAULT_STUDENT_NAME_ORDER);

  React.useEffect(() => {
    let active = true;
    getAutoscuolaSettings()
      .then((res) => {
        if (active && res.success && res.data) setOrder(res.data.studentNameOrder);
      })
      // Un errore qui non deve rompere nulla: si resta sul default.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <StudentNameOrderContext.Provider value={order}>
      {children}
    </StudentNameOrderContext.Provider>
  );
}

/**
 * Ordine scelto dall'autoscuola. Fuori dal provider torna il default, così un
 * componente riusato altrove non esplode: al massimo scrive "Nome Cognome".
 */
export function useStudentNameOrder(): StudentNameOrder {
  return React.useContext(StudentNameOrderContext);
}
