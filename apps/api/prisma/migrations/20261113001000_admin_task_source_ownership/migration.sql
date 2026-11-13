-- A disputed pet-ownership transfer raises an admin task (it used to reach nobody).
ALTER TYPE "AdminTaskSource" ADD VALUE 'OWNERSHIP_DISPUTE';
