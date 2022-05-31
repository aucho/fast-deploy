import { PathLike } from "fs";

export declare interface Config {
  serviceType: "ssh" | "ftp";
  remotePath: string;
  localPath: string;
  host: "121.196.188.121";
  port: number;
  username: string;
  password: string;
}
