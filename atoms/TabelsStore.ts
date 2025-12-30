import { atom } from "jotai";

export namespace Documents {
    export const documentsRowsSelected = atom<number | undefined>(
      undefined,
    );
    
    export const rows = atom<number | undefined>(undefined);

    export const documentsSelectedIds = atom<string[]>([]);
    export const documentsDeleteRequest = atom<number>(0);
}

export namespace Workflows {
    export const workflowsRowsSelected = atom<number | undefined>(
      undefined,
    );
    
    export const rows = atom<number | undefined>(undefined);

    export const workflowsSelectedIds = atom<string[]>([]);
    export const workflowsDeleteRequest = atom<number>(0);
    export const workflowsDisableRequest = atom<number>(0);
}
