# Server Actions Pattern

All mutations go through server actions (`"use server"`) in `lib/actions/*.actions.ts`.

## Pattern
```typescript
"use server";
const mySchema = z.object({ id: z.string().uuid() });

export async function myAction(input: z.infer<typeof mySchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = mySchema.parse(input);
    // ... logic
    return { success: true as const, data: result };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
```

## Action files
| File | Size | Domain |
|------|------|--------|
| `autoscuole.actions.ts` | 206KB | Core appointments, students, cases, exams, ratings, late cancellations |
| `autoscuole-availability.actions.ts` | 149KB | Availability, slots, publication, waitlist, booking suggestions |
| `autoscuole-settings.actions.ts` | 65KB | Config, instructors, vehicles, blocks, voice, policies |
| `autoscuole-swap.actions.ts` | 32KB | Peer-to-peer swaps |
| `autoscuole-holidays.actions.ts` | 9KB | Holiday management |
| `autoscuola-communications.actions.ts` | 10KB | Message templates + rules |
| `user.actions.ts` | 14KB | Profile, password, account deletion |
| `invite.actions.ts` | 18KB | Company/autoscuola invites |
| `company.actions.ts` | 7KB | Company CRUD |
| `backoffice.actions.ts` | 17KB | Admin operations |
| `storage.actions.ts` | 6KB | File upload URLs |
| `integration.actions.ts` | 1KB | Integration helpers |

## Key conventions
- Zod schema defined above action, typed input via `z.infer<typeof schema>`
- `requireServiceAccess("AUTOSCUOLE")` for auth + company context
- `isOwner(membership.autoscuolaRole)` for owner-only actions
- Always return `{ success: true, data }` or `{ success: false, message }`
- Cache invalidation at end of mutations via `invalidateAutoscuoleCache()`
