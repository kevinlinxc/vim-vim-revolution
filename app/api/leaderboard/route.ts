import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SONG_ID = 1

interface LeaderboardEntry {
  id: number
  score: number
  handle: string
  created_at: string
}

export async function GET() {
  const { data: scores, error } = await supabaseAdmin
    .from('leaderboard')
    .select('id, score, created_at, user_id, users!inner(handle)')
    .eq('song_id', SONG_ID)
    .order('score', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const entries: LeaderboardEntry[] = (scores ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    score: row.score as number,
    handle: (row.users as { handle: string }).handle,
    created_at: row.created_at as string,
  }))

  return NextResponse.json(entries)
}

export async function POST(request: NextRequest) {
  const { handle, score } = await request.json()

  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return NextResponse.json({ error: 'Handle is required' }, { status: 400 })
  }

  if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }

  const trimmedHandle = handle.trim().slice(0, 20)

  const { data: existingUsers, error: userLookupError } = await supabaseAdmin
    .from('users')
    .select('user_id, handle')
    .eq('handle', trimmedHandle)
    .limit(1)

  if (userLookupError) {
    return NextResponse.json({ error: userLookupError.message }, { status: 500 })
  }

  if (existingUsers && existingUsers.length > 0) {
    const existingUser = existingUsers[0]
    const userId = existingUser.user_id

    const { data: existingEntries, error: scoreLookupError } = await supabaseAdmin
      .from('leaderboard')
      .select('id, score')
      .eq('user_id', userId)
      .eq('song_id', SONG_ID)
      .order('score', { ascending: false })

    if (scoreLookupError) {
      return NextResponse.json({ error: scoreLookupError.message }, { status: 500 })
    }

    const hasEntries = existingEntries && existingEntries.length > 0

    if (hasEntries) {
      const highest = existingEntries.reduce((max, e) => (e.score > max.score ? e : max), existingEntries[0])

      if (score <= highest.score) {
        return NextResponse.json(
          { error: `Score too low. Beat ${highest.score.toLocaleString()} to improve.` },
          { status: 409 },
        )
      }

      const { error: updateError } = await supabaseAdmin
        .from('leaderboard')
        .update({
          score,
          created_at: new Date().toISOString(),
        })
        .eq('id', highest.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('leaderboard')
        .insert({
          user_id: userId,
          song_id: SONG_ID,
          score,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  } else {
    const { data: newUser, error: createUserError } = await supabaseAdmin
      .from('users')
      .insert({
        handle: trimmedHandle,
        created_at: new Date().toISOString(),
      })
      .select('user_id')
      .single()

    if (createUserError) {
      return NextResponse.json({ error: createUserError.message }, { status: 500 })
    }

    const { error: insertError } = await supabaseAdmin
      .from('leaderboard')
      .insert({
        user_id: (newUser as { user_id: number }).user_id,
        song_id: SONG_ID,
        score,
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  const { data: scores, error: listError } = await supabaseAdmin
    .from('leaderboard')
    .select('id, score, created_at, user_id, users!inner(handle)')
    .eq('song_id', SONG_ID)
    .order('score', { ascending: false })
    .limit(10)

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const entries: LeaderboardEntry[] = (scores ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    score: row.score as number,
    handle: (row.users as { handle: string }).handle,
    created_at: row.created_at as string,
  }))

  return NextResponse.json(entries)
}
