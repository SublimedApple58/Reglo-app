'use client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateProfile } from '@/lib/actions/user.actions';
import { updateProfileSchema } from '@/lib/validators';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { userRefreshAtom, userSessionAtom } from '@/atoms/user.store';

const ProfileForm = () => {
  const { update } = useSession();
  const session = useAtomValue(userSessionAtom);
  const setUserRefresh = useSetAtom(userRefreshAtom);

  const form = useForm<z.infer<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: session?.user?.name ?? '',
      email: session?.user?.email ?? '',
    },
  });

  const { toast } = useToast();

  const onSubmit = async (values: z.infer<typeof updateProfileSchema>) => {
    const res = await updateProfile(values);

    if (!res.success) {
      return toast({
        variant: 'destructive',
        description: res.message,
      });
    }

    if (session) {
      const newSession = {
        ...session,
        user: {
          ...session.user,
          name: values.name,
        },
      };

      await update(newSession);
    }
    setUserRefresh(true);

    toast({
      description: res.message,
    });
  };

  return (
    <Form {...form}>
      <form
        className='glass-panel glass-strong flex flex-col gap-5 p-5'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className='flex flex-col gap-5'>
          <FormField
            control={form.control}
            name='email'
            render={({ field }) => (
              <FormItem className='w-full'>
                <FormControl>
                  <Input
                    disabled
                    placeholder='Email'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem className='w-full'>
                <FormControl>
                  <Input
                    placeholder='Nome'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button
          type='submit'
          size='lg'
          className='col-span-2 w-full'
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Salvataggio...' : 'Aggiorna profilo'}
        </Button>
      </form>
    </Form>
  );
};

export default ProfileForm;
