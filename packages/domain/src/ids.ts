// Nominal (branded) entity ids. At runtime a ClienteId is just its string; at
// compile time it is NOT interchangeable with a PaqueteId, so a swapped id —
// e.g. looking a cliente up by a paqueteId — is a type error. Mint with `asXId`
// at a trusted boundary (a parsed input, a validated DB row); unbrand back to a
// plain string at the I/O edge. (audit 2026-06-30)
declare const idBrand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type ClienteId = Brand<string, "ClienteId">;
export type PaqueteId = Brand<string, "PaqueteId">;
export type CoachId = Brand<string, "CoachId">;
export type ClassTypeId = Brand<string, "ClassTypeId">;
export type RoomId = Brand<string, "RoomId">;
export type ClassSessionId = Brand<string, "ClassSessionId">;
export type ScheduleTemplateId = Brand<string, "ScheduleTemplateId">;

export const asClienteId = (id: string): ClienteId => id as ClienteId;
export const asPaqueteId = (id: string): PaqueteId => id as PaqueteId;
export const asCoachId = (id: string): CoachId => id as CoachId;
export const asClassTypeId = (id: string): ClassTypeId => id as ClassTypeId;
export const asRoomId = (id: string): RoomId => id as RoomId;
export const asClassSessionId = (id: string): ClassSessionId => id as ClassSessionId;
export const asScheduleTemplateId = (id: string): ScheduleTemplateId => id as ScheduleTemplateId;
