import fs from "fs";
import path from "path";
import { Config } from "./data";

const ERRORS = {
  NO_PACKAGE: "Fail to read package.json",
  NO_CONFIG: `
    Fail to read deploy config in package.json, \n
    try to add as follows:\n
    ...
    deploy {
      serviceType: "ssh",
      remotePath: "/hello",
      localPath: "./dist",
      host: "121.196.188.121",
      port: 22,
      username: "root",
      password: "j^K%Cf!+_-K2o6!xs5",
    }
 `,
};

type ErrorCode = keyof typeof ERRORS;

export const log = {
  warn: (info: string) => console.log(`\x1b[93m${info}\x1b[0m`),
  info: (info: string) => console.log(`\x1b[92m${info}\x1b[0m`),
  error: <T>(errorCode: T extends ErrorCode ? ErrorCode : string): void =>
    console.log(
      `\x1b[91m${ERRORS[errorCode as ErrorCode] ?? errorCode}\x1b[0m`
    ),
};

export const getConfig = (): Promise<Config | void> =>
  new Promise<Config | void>((resolve, reject: (result: ErrorCode) => void) => {
    let config: Config;
    try {
      const packageStr = fs.readFileSync(
        path.resolve(process.cwd(), "package.json"),
        { encoding: "utf8" }
      );
      const packageJson = JSON.parse(packageStr);
      config = packageJson.deploy;
    } catch (e) {
      reject("NO_PACKAGE");
      return;
    }
    if (!!!config) {
      reject("NO_CONFIG");
    }
    resolve(config);
  }).catch((error) => {
    log.error(error);
  });
