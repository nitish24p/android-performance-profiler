import { Logger } from "@perf-profiler/logger";
import {
  AveragedTestCaseResult,
  TestCaseIterationResult,
} from "@perf-profiler/types";
import { PerformanceMeasurer } from "./PerformanceMeasurer";
import { ensureCppProfilerIsInstalled } from "@perf-profiler/profiler";
import { writeReport } from "./writeReport";

export interface TestCase {
  beforeTest?: () => Promise<void> | void;
  run: () => Promise<void> | void;
  afterTest?: () => Promise<void> | void;
  duration?: number;
  getScore?: (result: AveragedTestCaseResult) => number;
}

class PerformanceTester {
  constructor(private bundleId: string, private testCase: TestCase) {
    // Important to ensure that the CPP profiler is initialized before we run the test!
    ensureCppProfilerIsInstalled();
  }

  private async executeTestCase(): Promise<TestCaseIterationResult> {
    try {
      const { beforeTest, run, afterTest, duration } = this.testCase;

      if (beforeTest) await beforeTest();

      const performanceMeasurer = new PerformanceMeasurer(this.bundleId);
      // We don't await here to not block the thread
      // but it's not ideal, we could spawn a worker for the measurer
      performanceMeasurer.start();
      await run();
      const measures = await performanceMeasurer.stop(duration);

      if (afterTest) await afterTest();

      return measures;
    } catch (error) {
      throw new Error("Error while running test");
    }
  }

  async iterate(
    iterationCount: number,
    maxRetries: number
  ): Promise<TestCaseIterationResult[]> {
    let retriesCount = 0;
    let currentIterationIndex = 0;
    const measures: TestCaseIterationResult[] = [];

    while (currentIterationIndex < iterationCount) {
      Logger.info(
        `Running iteration ${currentIterationIndex + 1}/${iterationCount}`
      );
      try {
        const measure = await this.executeTestCase();
        Logger.success(
          `Finished iteration ${
            currentIterationIndex + 1
          }/${iterationCount} in ${measure.time}ms (${retriesCount} ${
            retriesCount > 1 ? "retries" : "retry"
          } so far)`
        );
        measures.push(measure);
        currentIterationIndex++;
      } catch (error) {
        Logger.error(
          `Iteration ${
            currentIterationIndex + 1
          }/${iterationCount} failed (ignoring measure): ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );

        retriesCount++;
        if (retriesCount > maxRetries) {
          throw new Error("Max number of retries reached.");
        }
      }
    }

    if (measures.length === 0) {
      throw new Error("No measure returned");
    }

    return measures;
  }
}

export const measurePerformance = async (
  bundleId: string,
  testCase: TestCase,
  iterationCount = 10,
  maxRetries = 3
) => {
  const tester = new PerformanceTester(bundleId, testCase);
  const measures = await tester.iterate(iterationCount, maxRetries);

  return {
    measures,
    writeResults: (options: { path?: string; title?: string } = {}) =>
      writeReport(measures, {
        ...options,
        overrideScore: testCase.getScore,
      }),
  };
};
