import { User, Role, Skill } from "@shiftsync/shared-types";

export default function Home() {
  const dummyUser: User = {
    id: "1",
    name: "Admin User",
    email: "admin@example.com",
    role: Role.ADMIN,
    desiredWeeklyHours: 40,
    skills: [Skill.HOST],
    certifiedLocations: [],
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">ShiftSync Platform</h1>
      <p className="text-lg">Welcome, {dummyUser.name}</p>
    </main>
  );
}
