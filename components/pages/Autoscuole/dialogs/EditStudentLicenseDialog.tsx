"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateStudentLicensePath } from "@/lib/actions/autoscuole.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
  type LicenseCategory,
  type Transmission,
} from "@/lib/autoscuole/license";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  currentLicenseCategory?: string | null;
  currentTransmission?: string | null;
  onSuccess: (next: { licenseCategory: string; transmission: string }) => void;
};

export function EditStudentLicenseDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  currentLicenseCategory,
  currentTransmission,
  onSuccess,
}: Props) {
  const toast = useFeedbackToast();
  const [licenseCategory, setLicenseCategory] = React.useState<string>(
    currentLicenseCategory ?? "B",
  );
  const [transmission, setTransmission] = React.useState<string>(
    currentTransmission ?? "manual",
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setLicenseCategory(currentLicenseCategory ?? "B");
      setTransmission(currentTransmission ?? "manual");
    }
  }, [open, currentLicenseCategory, currentTransmission]);

  const unchanged =
    licenseCategory === (currentLicenseCategory ?? "B") &&
    transmission === (currentTransmission ?? "manual");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await updateStudentLicensePath({
        studentId,
        licenseCategory: licenseCategory as LicenseCategory,
        transmission: transmission as Transmission,
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Errore aggiornamento percorso patente." });
        return;
      }
      toast.success({ description: res.message ?? "Percorso patente aggiornato." });
      onSuccess({ licenseCategory, transmission });
      onOpenChange(false);
    } catch (error) {
      toast.error({ description: (error as Error)?.message ?? "Errore inatteso." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Percorso patente</DialogTitle>
          <DialogDescription>
            Imposta la patente che <strong>{studentName}</strong> sta conseguendo.
            È nota dalla teoria e determina i veicoli idonei nelle prenotazioni.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria patente</Label>
              <Select value={licenseCategory} onValueChange={setLicenseCategory}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="cursor-pointer">
                      {LICENSE_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cambio</Label>
              <Select value={transmission} onValueChange={setTransmission}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSMISSIONS.map((t) => (
                    <SelectItem key={t} value={t} className="cursor-pointer">
                      {TRANSMISSION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="cursor-pointer"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || unchanged}
              className="cursor-pointer"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {saving ? "Salvataggio…" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
