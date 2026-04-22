const CAL_API_BASE = "https://api.cal.com/v2";
const CAL_BOOKINGS_API_VERSION = "2026-02-25";
const CAL_SLOTS_API_VERSION = "2024-09-04";

interface CalSlot {
  start: string;
  end?: string;
}

interface CalSlotsResponse {
  status?: string;
  data?: Record<string, CalSlot[]>;
  error?: unknown;
  message?: string;
}

interface CreateCalBookingParams {
  start: string;
  attendee: {
    name: string;
    email: string;
    timeZone: string;
  };
  metadata: Record<string, string>;
  lengthInMinutes?: number;
}

interface CalBookingResponse {
  status?: string;
  data?: {
    uid?: string;
    id?: number;
    bookingUid?: string;
    bookingId?: number;
    startTime?: string;
    endTime?: string;
    metadata?: Record<string, string>;
  };
  error?: unknown;
  message?: string;
}

function getCalApiKey(): string {
  const apiKey = process.env.CAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CAL_API_KEY environment variable is not set");
  }
  return apiKey;
}

function getCalEventTypeParams(): Record<string, string> {
  const eventTypeId = process.env.CAL_EVENT_TYPE_ID?.trim();
  if (eventTypeId) {
    return { eventTypeId };
  }

  const eventTypeSlug = process.env.CAL_EVENT_TYPE_SLUG?.trim();
  const username = process.env.CAL_USERNAME?.trim();
  const teamSlug = process.env.CAL_TEAM_SLUG?.trim();
  const organizationSlug = process.env.CAL_ORGANIZATION_SLUG?.trim();

  if (!eventTypeSlug || (!username && !teamSlug)) {
    throw new Error(
      "Set CAL_EVENT_TYPE_ID, or set CAL_EVENT_TYPE_SLUG with CAL_USERNAME or CAL_TEAM_SLUG"
    );
  }

  return {
    eventTypeSlug,
    ...(username ? { username } : {}),
    ...(teamSlug ? { teamSlug } : {}),
    ...(organizationSlug ? { organizationSlug } : {}),
  };
}

function getBookingLength(): number | undefined {
  const raw = process.env.CAL_BOOKING_LENGTH_MINUTES?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getCalHeaders(apiVersion: string): HeadersInit {
  return {
    Authorization: `Bearer ${getCalApiKey()}`,
    "Content-Type": "application/json",
    "cal-api-version": apiVersion,
  };
}

async function parseCalResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const maybeMessage = data as { message?: string; error?: unknown };
    const details =
      maybeMessage.message ??
      (typeof maybeMessage.error === "string" ? maybeMessage.error : undefined) ??
      `Cal.com API returned ${response.status}`;
    throw new Error(details);
  }
  return data;
}

export function hasCalSchedulingConfig(): boolean {
  return Boolean(
    process.env.CAL_API_KEY?.trim() &&
      (process.env.CAL_EVENT_TYPE_ID?.trim() ||
        (process.env.CAL_EVENT_TYPE_SLUG?.trim() &&
          (process.env.CAL_USERNAME?.trim() || process.env.CAL_TEAM_SLUG?.trim())))
  );
}

export async function getCalAvailableSlots(params: {
  start: string;
  end: string;
  timeZone: string;
  duration?: number;
}) {
  const query = new URLSearchParams({
    start: params.start,
    end: params.end,
    timeZone: params.timeZone,
    ...getCalEventTypeParams(),
  });

  const duration = params.duration ?? getBookingLength();
  if (duration) query.set("duration", String(duration));

  const response = await fetch(`${CAL_API_BASE}/slots?${query.toString()}`, {
    method: "GET",
    headers: getCalHeaders(CAL_SLOTS_API_VERSION),
    cache: "no-store",
  });

  const result = await parseCalResponse<CalSlotsResponse>(response);
  return result.data ?? {};
}

export async function createCalBooking(params: CreateCalBookingParams) {
  const eventTypeParams = getCalEventTypeParams();
  const eventTypeId = eventTypeParams.eventTypeId
    ? Number.parseInt(eventTypeParams.eventTypeId, 10)
    : undefined;
  const lengthInMinutes = params.lengthInMinutes ?? getBookingLength();

  const body = {
    start: params.start,
    attendee: {
      name: params.attendee.name,
      email: params.attendee.email,
      timeZone: params.attendee.timeZone,
      language: "en",
    },
    metadata: params.metadata,
    ...(lengthInMinutes ? { lengthInMinutes } : {}),
    ...(eventTypeId
      ? { eventTypeId }
      : {
          eventTypeSlug: eventTypeParams.eventTypeSlug,
          ...(eventTypeParams.username ? { username: eventTypeParams.username } : {}),
          ...(eventTypeParams.teamSlug ? { teamSlug: eventTypeParams.teamSlug } : {}),
          ...(eventTypeParams.organizationSlug
            ? { organizationSlug: eventTypeParams.organizationSlug }
            : {}),
        }),
  };

  const response = await fetch(`${CAL_API_BASE}/bookings`, {
    method: "POST",
    headers: getCalHeaders(process.env.CAL_BOOKINGS_API_VERSION?.trim() || CAL_BOOKINGS_API_VERSION),
    body: JSON.stringify(body),
  });

  return parseCalResponse<CalBookingResponse>(response);
}
