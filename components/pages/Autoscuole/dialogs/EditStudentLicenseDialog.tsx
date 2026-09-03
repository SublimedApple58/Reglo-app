"use client";

import * as React from "react";

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
import { LicenseCategorySelectItems } from "../LicenseCategorySelectItems";
import { updateStudentLicensePath } from "@/lib/actions/autoscuole.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
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

  // Compare against the ACTUAL stored values, not the "B"/"manual" display
  // defaults (REG-422): a student with no license yet has `currentLicenseCategory
  // = null`. Falling back to "B" here made "B + manual" look unchanged → the Save
  // button stayed disabled, so B was the ONE category the owner could never set on
  // a fresh student (every other category differed from the "B" default and saved
  // fine). A null current means any selection is a real change.
  const unchanged =
    licenseCategory === (currentLicenseCategory ?? null) &&
    transmission === (currentTransmission ?? null);

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
      <DialogContent overlayClassName="z-[250]" className="z-[250] sm:max-w-md">
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
                <SelectContent className="z-[300]">
                  <LicenseCategorySelectItems className="cursor-pointer" />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cambio</Label>
              <Select value={transmission} onValueChange={setTransmission}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[300]">
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
              {saving ? <LoadingDots /> : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
