# hiring-with-ai

## Cal.com scheduling

Scheduled interview slots are loaded from Cal.com API v2, and confirmed booking webhooks create interview sessions in MongoDB.

Required environment variables:

```bash
CAL_API_KEY=cal_...
CAL_EVENT_TYPE_ID=123
CAL_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_APP_URL=https://your-app.example.com
CAL_BOOKING_LENGTH_MINUTES=3
```

Instead of `CAL_EVENT_TYPE_ID`, you can use `CAL_EVENT_TYPE_SLUG` with either `CAL_USERNAME` or `CAL_TEAM_SLUG`. Set `CAL_BOOKING_LENGTH_MINUTES=3` for the 3-minute AI interview. Optional variables: `CAL_ORGANIZATION_SLUG` and `CAL_BOOKINGS_API_VERSION`.

Configure the Cal.com webhook subscriber URL as:

```txt
https://your-app.example.com/api/interview-scheduled
```

Subscribe it to `BOOKING_CREATED`, `BOOKING_CONFIRMED`, and `BOOKING_RESCHEDULED`.
