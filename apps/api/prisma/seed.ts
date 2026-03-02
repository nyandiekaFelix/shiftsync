import { PrismaClient, Role, Skill, AvailabilityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

const weekdayToIsoMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function getFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
}

function getPart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

function getOffsetMinutes(date: Date, timezone: string): number {
  const parts = getFormatter(timezone).formatToParts(date);
  const localAsUtc = Date.UTC(
    Number(getPart(parts, 'year')),
    Number(getPart(parts, 'month')) - 1,
    Number(getPart(parts, 'day')),
    Number(getPart(parts, 'hour')),
    Number(getPart(parts, 'minute')),
    Number(getPart(parts, 'second')),
  );
  return (localAsUtc - date.getTime()) / (1000 * 60);
}

function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const offsetMinutes = getOffsetMinutes(new Date(utcMillis), timezone);
    utcMillis =
      Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
      offsetMinutes * 60 * 1000;
  }
  return new Date(utcMillis);
}

function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const parts = getFormatter(timezone).formatToParts(date);
  return {
    year: Number(getPart(parts, 'year')),
    month: Number(getPart(parts, 'month')),
    day: Number(getPart(parts, 'day')),
  };
}

function getIsoWeekday(date: Date, timezone: string): number {
  const parts = getFormatter(timezone).formatToParts(date);
  const weekday = getPart(parts, 'weekday');
  return weekdayToIsoMap[weekday] ?? 1;
}

function addDaysToLocalDate(
  parts: LocalDateParts,
  days: number,
): LocalDateParts {
  const proxy = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  proxy.setUTCDate(proxy.getUTCDate() + days);
  return {
    year: proxy.getUTCFullYear(),
    month: proxy.getUTCMonth() + 1,
    day: proxy.getUTCDate(),
  };
}

function getNextMondayInTimezone(timezone: string): LocalDateParts {
  const now = new Date();
  const currentWeekday = getIsoWeekday(now, timezone);
  const daysUntilNextMonday = currentWeekday === 1 ? 7 : 8 - currentWeekday;
  return addDaysToLocalDate(
    getLocalDateParts(now, timezone),
    daysUntilNextMonday,
  );
}

async function main() {
  console.log('Seeding database...');
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash('password123', saltRounds);

  try {
    // Clean the database
    console.log('Cleaning existing data...');
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.swapRequest.deleteMany();
    await prisma.availability.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.user.deleteMany();
    await prisma.location.deleteMany();
    console.log('Database cleaned.');

    // 1. Create Locations (across 2 timezones)
    console.log('Creating locations...');
    const loc1 = await prisma.location.create({
      data: {
        name: 'Coastal Eats - Seattle North',
        timezone: 'America/Los_Angeles',
        address: '123 Pine St, Seattle, WA',
      },
    });
    const loc2 = await prisma.location.create({
      data: {
        name: 'Coastal Eats - Seattle Downtown',
        timezone: 'America/Los_Angeles',
        address: '456 Pike St, Seattle, WA',
      },
    });
    const loc3 = await prisma.location.create({
      data: {
        name: 'Coastal Eats - NY Times Square',
        timezone: 'America/New_York',
        address: '789 Broadway, New York, NY',
      },
    });
    const loc4 = await prisma.location.create({
      data: {
        name: 'Coastal Eats - NY Brooklyn',
        timezone: 'America/New_York',
        address: '101 Main St, Brooklyn, NY',
      },
    });
    console.log('Locations created.');

    // 2. Create Users
    console.log('Creating admin and managers...');
    await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'Global Admin',
        password: hashedPassword,
        role: Role.ADMIN,
      },
    });

    await prisma.user.create({
      data: {
        email: 'manager.sea@example.com',
        name: 'Seattle Manager',
        password: hashedPassword,
        role: Role.MANAGER,
        desiredWeeklyHours: 40,
        certifiedLocations: [loc1.id, loc2.id],
      },
    });

    await prisma.user.create({
      data: {
        email: 'manager.ny@example.com',
        name: 'NY Manager',
        password: hashedPassword,
        role: Role.MANAGER,
        desiredWeeklyHours: 40,
        certifiedLocations: [loc3.id, loc4.id],
      },
    });
    console.log('Admin and managers created.');

    // 3. Create Staff
    console.log('Creating staff members and availability...');
    const staffMembers = [
      {
        name: 'Alice Bartender',
        email: 'alice@example.com',
        skills: [Skill.BARTENDER, Skill.SERVER],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Bob Cook',
        email: 'bob@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Charlie Host',
        email: 'charlie@example.com',
        skills: [Skill.HOST, Skill.SERVER],
        locs: [loc1.id],
      },
      {
        name: 'David Server',
        email: 'david@example.com',
        skills: [Skill.SERVER],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Eve Cook',
        email: 'eve@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Frank Bartender',
        email: 'frank@example.com',
        skills: [Skill.BARTENDER],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Gina Server',
        email: 'gina@example.com',
        skills: [Skill.SERVER],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Hank Cook',
        email: 'hank@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Ivy Host',
        email: 'ivy@example.com',
        skills: [Skill.HOST],
        locs: [loc2.id],
      },
      {
        name: 'Jack Bartender',
        email: 'jack@example.com',
        skills: [Skill.BARTENDER],
        locs: [loc1.id],
      },
      {
        name: 'Kathy Server',
        email: 'kathy@example.com',
        skills: [Skill.SERVER],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Leo Cook',
        email: 'leo@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Mona Host',
        email: 'mona@example.com',
        skills: [Skill.HOST],
        locs: [loc3.id],
      },
      {
        name: 'Nate Bartender',
        email: 'nate@example.com',
        skills: [Skill.BARTENDER],
        locs: [loc4.id],
      },
      {
        name: 'Olivia Server',
        email: 'olivia@example.com',
        skills: [Skill.SERVER],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Peter Cook',
        email: 'peter@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Quinn Host',
        email: 'quinn@example.com',
        skills: [Skill.HOST],
        locs: [loc3.id, loc4.id],
      },
      {
        name: 'Riley Host',
        email: 'riley@example.com',
        skills: [Skill.HOST],
        locs: [loc1.id, loc2.id],
      },
      {
        name: 'Sam Cook',
        email: 'sam@example.com',
        skills: [Skill.LINE_COOK],
        locs: [loc1.id, loc2.id, loc3.id, loc4.id],
      },
      {
        name: 'Tara Server',
        email: 'tara@example.com',
        skills: [Skill.SERVER],
        locs: [loc1.id, loc2.id, loc3.id, loc4.id],
      },
    ];

    const dbStaff: { id: string; email: string }[] = [];
    for (const s of staffMembers) {
      const user = await prisma.user.create({
        data: {
          email: s.email,
          name: s.name,
          password: hashedPassword,
          role: Role.STAFF,
          desiredWeeklyHours: 32 + (dbStaff.length % 3) * 4,
          skills: s.skills,
          certifiedLocations: s.locs,
        },
      });
      dbStaff.push({ id: user.id, email: user.email });

      // Add recurring availability (9 AM - 5 PM, Mon-Fri)
      for (let day = 1; day <= 5; day++) {
        await prisma.availability.create({
          data: {
            userId: user.id,
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            type: AvailabilityType.RECURRING,
          },
        });
      }
    }
    console.log('Staff and availability created.');

    // 4. Create Shifts for the next week
    console.log('Creating shifts...');
    const nextWeekInSeattle = getNextMondayInTimezone(loc1.timezone);

    const shifts: { id: string; requiredSkill: Skill }[] = [];
    // Create some shifts for Seattle North (loc1)
    for (let i = 0; i < 5; i++) {
      const localDay = addDaysToLocalDate(nextWeekInSeattle, i);
      const lunchStart = zonedDateTimeToUtc(
        loc1.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        11,
        0,
      );
      const lunchEnd = zonedDateTimeToUtc(
        loc1.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        15,
        0,
      );
      const dinnerStart = zonedDateTimeToUtc(
        loc1.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        17,
        0,
      );
      const dinnerEnd = zonedDateTimeToUtc(
        loc1.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        22,
        0,
      );

      const s1 = await prisma.shift.create({
        data: {
          locationId: loc1.id,
          startTime: lunchStart,
          endTime: lunchEnd,
          requiredSkill: Skill.SERVER,
          requiredHeadcount: 2,
        },
      });
      shifts.push({ id: s1.id, requiredSkill: s1.requiredSkill });

      const s2 = await prisma.shift.create({
        data: {
          locationId: loc1.id,
          startTime: dinnerStart,
          endTime: dinnerEnd,
          requiredSkill: Skill.BARTENDER,
          requiredHeadcount: 1,
        },
      });
      shifts.push({ id: s2.id, requiredSkill: s2.requiredSkill });
    }
    console.log('Shifts created.');

    // 5. Create some initial assignments
    console.log('Creating initial assignments...');
    const alice = dbStaff.find((s) => s.email === 'alice@example.com');
    const david = dbStaff.find((s) => s.email === 'david@example.com');

    if (alice && david) {
      // Assign Alice to a bartender shift
      const bartenderShift = shifts.find(
        (s) => s.requiredSkill === Skill.BARTENDER,
      );
      if (bartenderShift) {
        await prisma.assignment.create({
          data: { shiftId: bartenderShift.id, userId: alice.id },
        });
      }

      // Assign David to a server shift
      const serverShift = shifts.find((s) => s.requiredSkill === Skill.SERVER);
      if (serverShift) {
        await prisma.assignment.create({
          data: { shiftId: serverShift.id, userId: david.id },
        });
      }
    }

    // --- CONSTRAINT TESTING DATA ---
    console.log('Adding specific data for constraint testing...');

    // 1. Midnight Availability Case: Zane Night
    // Zane is only available from 10 PM to 6 AM the next day.
    const zane = await prisma.user.create({
      data: {
        email: 'zane@example.com',
        name: 'Zane Night',
        password: hashedPassword,
        role: Role.STAFF,
        skills: [Skill.LINE_COOK],
        certifiedLocations: [loc1.id],
      },
    });

    // Create a split availability that "simulates" a midnight cross
    // Monday 10 PM - Midnight
    await prisma.availability.create({
      data: {
        userId: zane.id,
        dayOfWeek: 1,
        startTime: '22:00',
        endTime: '23:59',
        type: AvailabilityType.RECURRING,
      },
    });
    // Tuesday Midnight - 6 AM
    await prisma.availability.create({
      data: {
        userId: zane.id,
        dayOfWeek: 2,
        startTime: '00:00',
        endTime: '06:00',
        type: AvailabilityType.RECURRING,
      },
    });

    // 2. Weekly Limit Case: Yolanda Weekly
    // Yolanda is already at 38 hours for next week.
    const yolanda = await prisma.user.create({
      data: {
        email: 'yolanda@example.com',
        name: 'Yolanda Weekly',
        password: hashedPassword,
        role: Role.STAFF,
        skills: [Skill.SERVER],
        certifiedLocations: [loc2.id],
      },
    });

    // Add recurring availability for seeded weekly test.
    for (let day = 1; day <= 5; day++) {
      await prisma.availability.create({
        data: {
          userId: yolanda.id,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '18:00',
          type: AvailabilityType.RECURRING,
        },
      });
    }

    // Add 4 shifts of 9.5 hours each = 38 hours
    const nextWeekInSeattleDowntown = getNextMondayInTimezone(loc2.timezone);
    for (let i = 0; i < 4; i++) {
      const localDay = addDaysToLocalDate(nextWeekInSeattleDowntown, i);
      const start = zonedDateTimeToUtc(
        loc2.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        8,
        0,
      );
      const end = zonedDateTimeToUtc(
        loc2.timezone,
        localDay.year,
        localDay.month,
        localDay.day,
        17,
        30,
      ); // 9.5 hours

      const s = await prisma.shift.create({
        data: {
          locationId: loc2.id,
          startTime: start,
          endTime: end,
          requiredSkill: Skill.SERVER,
        },
      });
      await prisma.assignment.create({
        data: { shiftId: s.id, userId: yolanda.id },
      });
    }

    // 3. Consecutive Days Case: Xavier Streak
    // Xavier has worked 6 days straight leading up to the Friday of next week.
    const xavier = await prisma.user.create({
      data: {
        email: 'xavier@example.com',
        name: 'Xavier Streak',
        password: hashedPassword,
        role: Role.STAFF,
        skills: [Skill.HOST],
        certifiedLocations: [loc1.id],
      },
    });

    // Add recurring availability for seeded consecutive-day test.
    for (let day = 1; day <= 7; day++) {
      await prisma.availability.create({
        data: {
          userId: xavier.id,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '18:00',
          type: AvailabilityType.RECURRING,
        },
      });
    }

    // Assign to 6 days straight (Saturday to Thursday local Seattle time).
    const lastSaturdayInSeattle = addDaysToLocalDate(nextWeekInSeattle, -2);
    for (let i = 0; i < 6; i++) {
      const localDay = addDaysToLocalDate(lastSaturdayInSeattle, i);
      const s = await prisma.shift.create({
        data: {
          locationId: loc1.id,
          startTime: zonedDateTimeToUtc(
            loc1.timezone,
            localDay.year,
            localDay.month,
            localDay.day,
            9,
            0,
          ),
          endTime: zonedDateTimeToUtc(
            loc1.timezone,
            localDay.year,
            localDay.month,
            localDay.day,
            12,
            0,
          ),
          requiredSkill: Skill.HOST,
        },
      });
      await prisma.assignment.create({
        data: { shiftId: s.id, userId: xavier.id },
      });
    }

    console.log('Phase 5 testing data created.');
    console.log('Initial assignments created.');
    console.log('Seeding completed successfully.');
  } catch (error: unknown) {
    console.error('Error during seeding:', error);
    if (error && typeof error === 'object' && 'code' in error) {
      console.error('Prisma Error Code:', error.code);
    }
    if (error && typeof error === 'object' && 'meta' in error) {
      console.error('Prisma Error Meta:', error.meta);
    }
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
