"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateUser } from "@/lib/actions/user.actions";
import { AUTOSCUOLA_ROLES, COMPANY_MEMBER_ROLES } from "@/lib/constants";
import { updateUserSchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ControllerRenderProps, useForm } from "react-hook-form";
import { z } from "zod";

const UpdateUserForm = ({
  user,
  onSuccess,
  redirectOnSuccess = true,
  formId = "update-user-form",
  onSubmittingChange,
  showFooterActions = true,
}: {
  user: z.infer<typeof updateUserSchema>;
  onSuccess?: () => void;
  redirectOnSuccess?: boolean;
  formId?: string;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  showFooterActions?: boolean;
}) => {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: user,
  });

  const onSubmit = async (values: z.infer<typeof updateUserSchema>) => {
    try {
      const res = await updateUser({
        ...values,
        id: user.id,
      });

      if (!res.success) {
        return toast({
          variant: "destructive",
          description: res.message,
        });
      }

      toast({
        description: res.message,
      });
      form.reset(values);
      onSuccess?.();
      if (redirectOnSuccess) {
        router.push("/admin/users");
      } else {
        router.refresh();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        description: (error as Error).message,
      });
    }
  };

  React.useEffect(() => {
    onSubmittingChange?.(form.formState.isSubmitting);
  }, [form.formState.isSubmitting, onSubmittingChange]);

  return (
    <Form {...form}>
      <form
        method="POST"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        id={formId}
      >
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Identity
            </p>
            <p className="text-sm text-muted-foreground">
              Core profile details used across the workspace.
            </p>
          </div>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof updateUserSchema>,
                  "email"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      disabled
                      placeholder="Enter user email"
                      className="bg-muted/40"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof updateUserSchema>,
                  "name"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter user name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Access
            </p>
            <p className="text-sm text-muted-foreground">
              Control permissions and administrative access.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="role"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof updateUserSchema>,
                  "role"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>Role</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMPANY_MEMBER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === "admin" ? "Admin" : "Member"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="autoscuolaRole"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof updateUserSchema>,
                  "autoscuolaRole"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>Ruolo Autoscuola</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? "STUDENT"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona ruolo autoscuola" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AUTOSCUOLA_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === "OWNER"
                            ? "Titolare"
                            : role === "INSTRUCTOR"
                              ? "Istruttore"
                              : "Allievo"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {showFooterActions ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="submit"
              className="min-w-[160px]"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
};

export default UpdateUserForm;
