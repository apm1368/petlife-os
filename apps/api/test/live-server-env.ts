// Imported first by specs that must boot the API like the live server (dev simulation off). ConfigModule reads
// process.env when AppModule is imported, so this has to run before test-app is loaded; the spec restores the
// previous value in afterAll so later spec files in the same process keep the suite default.
export const previousDevSimulation = process.env.DEV_SIMULATION_ENABLED;
process.env.DEV_SIMULATION_ENABLED = "false";
