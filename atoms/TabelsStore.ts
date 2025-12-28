import { atom } from "jotai";

export namespace Documents {
    export const documentsRowsSelected = atom<number | undefined>(
      undefined,
    );
    
    export const rows = atom<number | undefined>(undefined);
}

export namespace Workflows {
    export const workflowsRowsSelected = atom<number | undefined>(
      undefined,
    );
    
    export const rows = atom<number | undefined>(undefined);
}
