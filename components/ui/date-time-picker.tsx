"use client";

import React from "react";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDateTimeLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;

const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 7; hour <= 21; hour += 1) {
    times.push(`${pad(hour)}:00`);
    times.push(`${pad(hour)}:30`);
  }
  return times;
};

export function DateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const initialDate = value ? new Date(value) : null;
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(initialDate);
  const [time, setTime] = React.useState<string>(
    initialDate ? `${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}` : "09:00",
  );

  React.useEffect(() => {
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    setSelectedDate(parsed);
    setTime(`${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`);
  }, [value]);

  const applySelection = (date: Date | null, nextTime = time) => {
    if (!date) return;
    const [hours, minutes] = nextTime.split(":").map(Number);
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    setSelectedDate(next);
    onChange(formatDateTimeLocal(next));
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="space-y-3">
      <DatePicker
        value={selectedDate ? formatDateTimeLocal(selectedDate).split("T")[0] : ""}
        onChange={(dateValue) => {
          const nextDate = new Date(dateValue);
          if (Number.isNaN(nextDate.getTime())) return;
          applySelection(nextDate);
        }}
      />
      <Select
        value={time}
        onValueChange={(value) => {
          setTime(value);
          if (selectedDate) {
            applySelection(selectedDate, value);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Seleziona orario" />
        </SelectTrigger>
        <SelectContent>
          {timeOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
