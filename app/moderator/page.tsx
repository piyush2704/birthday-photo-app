import { BirthdayApp } from "../../components/birthday-app";

export default function ModeratorPage({
  searchParams,
}: {
  searchParams?: { event?: string };
}) {
  return (
    <BirthdayApp
      initialGuestAccess={{
        eventCode: searchParams?.event?.toUpperCase() || "",
        pin: "",
      }}
    />
  );
}
