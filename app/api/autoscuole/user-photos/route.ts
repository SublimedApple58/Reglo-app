import { NextResponse } from 'next/server';
import { getUserPhotoUrls } from '@/lib/actions/user-photos.actions';

const parseIds = (value: string | null) =>
  value ? value.split(',').map((id) => id.trim()).filter(Boolean) : [];

/** Foto profilo batched per gli avatar mobile (auth Bearer via company-context). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await getUserPhotoUrls({
    userIds: parseIds(searchParams.get('ids')),
    instructorIds: parseIds(searchParams.get('instructorIds')),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
