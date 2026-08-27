import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { Auction } from '@/types'
import type { AuctionInput } from '@/lib/validation'

export async function listAuctionsForYear(yearProfileId: string): Promise<Auction[]> {
  return db.auctions.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getAuction(id: string): Promise<Auction | undefined> {
  return db.auctions.get(id)
}

export async function insertAuction(yearProfileId: string, input: AuctionInput): Promise<Auction> {
  const now = nowIso()
  const auction: Auction = {
    id: generateId(),
    yearProfileId,
    item: input.item.trim(),
    person: input.person.trim(),
    amount: input.amount,
    date: input.date,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.auctions.add(auction)
  return auction
}

export async function updateAuction(id: string, input: AuctionInput): Promise<void> {
  await db.auctions.update(id, {
    item: input.item.trim(),
    person: input.person.trim(),
    amount: input.amount,
    date: input.date,
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso(),
  })
}

export async function deleteAuction(id: string): Promise<void> {
  await db.auctions.delete(id)
}
