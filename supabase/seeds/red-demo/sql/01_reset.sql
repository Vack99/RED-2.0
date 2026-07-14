-- Remove the junk test operational rows (restored verbatim by the teardown).
delete from asistencias  where gym_id = 'daa1c888-192b-4cf6-9fc0-023e314a803f';
delete from reservation  where gym_id = 'daa1c888-192b-4cf6-9fc0-023e314a803f';
delete from ventas       where gym_id = 'daa1c888-192b-4cf6-9fc0-023e314a803f';

