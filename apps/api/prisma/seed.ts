import { PrismaClient, Role, Skill, AvailabilityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { addDays, setHours, setMinutes, startOfWeek, addWeeks } from 'date-fns';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  try {
    // Clean the database
    console.log('Cleaning existing data...');
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
      data: { name: 'Coastal Eats - Seattle North', timezone: 'America/Los_Angeles', address: '123 Pine St, Seattle, WA' },
    });
    const loc2 = await prisma.location.create({
      data: { name: 'Coastal Eats - Seattle Downtown', timezone: 'America/Los_Angeles', address: '456 Pike St, Seattle, WA' },
    });
    const loc3 = await prisma.location.create({
      data: { name: 'Coastal Eats - NY Times Square', timezone: 'America/New_York', address: '789 Broadway, New York, NY' },
    });
    const loc4 = await prisma.location.create({
      data: { name: 'Coastal Eats - NY Brooklyn', timezone: 'America/New_York', address: '101 Main St, Brooklyn, NY' },
    });
    console.log('Locations created.');

    // 2. Create Users
    console.log('Creating admin and managers...');
    const admin = await prisma.user.create({
      data: {
        email: 'admin@shiftsync.com',
        name: 'Global Admin',
        role: Role.ADMIN,
      },
    });

    const manager1 = await prisma.user.create({
      data: {
        email: 'manager.sea@shiftsync.com',
        name: 'Seattle Manager',
        role: Role.MANAGER,
        certifiedLocations: [loc1.id, loc2.id],
      },
    });

    const manager2 = await prisma.user.create({
      data: {
        email: 'manager.ny@shiftsync.com',
        name: 'NY Manager',
        role: Role.MANAGER,
        certifiedLocations: [loc3.id, loc4.id],
      },
    });
    console.log('Admin and managers created.');

    // 3. Create Staff
    console.log('Creating staff members and availability...');
    const staffMembers = [
      { name: 'Alice Bartender', email: 'alice@example.com', skills: [Skill.BARTENDER, Skill.SERVER], locs: [loc1.id, loc2.id] },
      { name: 'Bob Cook', email: 'bob@example.com', skills: [Skill.LINE_COOK], locs: [loc1.id, loc2.id] },
      { name: 'Charlie Host', email: 'charlie@example.com', skills: [Skill.HOST, Skill.SERVER], locs: [loc1.id] },
      { name: 'David Server', email: 'david@example.com', skills: [Skill.SERVER], locs: [loc1.id, loc2.id] },
      { name: 'Eve Cook', email: 'eve@example.com', skills: [Skill.LINE_COOK], locs: [loc3.id, loc4.id] },
      { name: 'Frank Bartender', email: 'frank@example.com', skills: [Skill.BARTENDER], locs: [loc3.id, loc4.id] },
    ];

    const dbStaff: any[] = [];
    for (const s of staffMembers) {
      const user = await prisma.user.create({
        data: {
          email: s.email,
          name: s.name,
          role: Role.STAFF,
          skills: s.skills,
          certifiedLocations: s.locs,
        },
      });
      dbStaff.push(user);

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
    const today = startOfWeek(new Date());
    const nextWeek = addWeeks(today, 1);

    const shifts: any[] = [];
    // Create some shifts for Seattle North (loc1)
    for (let i = 0; i < 5; i++) {
      const day = addDays(nextWeek, i);
      const lunchStart = setMinutes(setHours(day, 11), 0);
      const lunchEnd = setMinutes(setHours(day, 15), 0);
      const dinnerStart = setMinutes(setHours(day, 17), 0);
      const dinnerEnd = setMinutes(setHours(day, 22), 0);

      shifts.push(await prisma.shift.create({
        data: { locationId: loc1.id, startTime: lunchStart, endTime: lunchEnd, requiredSkill: Skill.SERVER, requiredHeadcount: 2 }
      }));
      shifts.push(await prisma.shift.create({
        data: { locationId: loc1.id, startTime: dinnerStart, endTime: dinnerEnd, requiredSkill: Skill.BARTENDER, requiredHeadcount: 1 }
      }));
    }
    console.log('Shifts created.');

    // 5. Create some initial assignments
    console.log('Creating initial assignments...');
    const alice = dbStaff.find((s: any) => s.email === 'alice@example.com');
    const david = dbStaff.find((s: any) => s.email === 'david@example.com');

    if (alice && david) {
      // Assign Alice to a bartender shift
      const bartenderShift = shifts.find((s: any) => s.requiredSkill === Skill.BARTENDER);
      if (bartenderShift) {
        await prisma.assignment.create({
          data: { shiftId: bartenderShift.id, userId: alice.id }
        });
      }

      // Assign David to a server shift
      const serverShift = shifts.find((s: any) => s.requiredSkill === Skill.SERVER);
      if (serverShift) {
        await prisma.assignment.create({
          data: { shiftId: serverShift.id, userId: david.id }
        });
      }
    }
    console.log('Initial assignments created.');
    console.log('Seeding completed successfully.');
  } catch (error: any) {
    console.error('Error during seeding:', error);
    if (error.code) {
      console.error('Prisma Error Code:', error.code);
    }
    if (error.meta) {
      console.error('Prisma Error Meta:', error.meta);
    }
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
