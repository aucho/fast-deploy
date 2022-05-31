import Client from "ftp";
import fs, { Dirent, PathLike } from "fs";
import thread, { MessageChannel } from "worker_threads";
import path from "path";
import { log } from "./utils";
import { Config } from "./data";

// export interface Config extends Client.Options {
//   remotePath: string;
//   localPath: string;
// }

type TreeMap = Map<string, string | TreeMap | boolean>;
type Tree<T> = (T | Tree<T>)[];
type State = "constructing" | "ready";
/* 
  [
    file => relativePath
  ]
*/

class Deployer {
  static isFile = Symbol(1);
  static isDictory = Symbol(0);

  public options: Config;
  public state: State;
  public client: Client;
  public filesMap: Map<string, Symbol>;
  public rootPath: string;
  private _events: { [KEY in State]?: (() => void)[] };

  constructor(props: Config) {
    console.time("a:");
    this.options = props;
    this.state = "constructing";
    this.client = new Client();
    this.filesMap = new Map();
    this._events = {};
    this.rootPath = path.resolve(process.cwd(), this.options.localPath);
    this.init();
  }

  init = (): void => {
    this.traverseDictory()
      .then(() => {
        this.changeState("ready");
      })
      .catch((error: Error) => {
        log.error(error.message);
      });
  };

  changeState = (state: State) => {
    this.state = state;
    if (Array.isArray(this._events[state])) {
      this._events[state]?.forEach((callback) => {
        if (typeof callback !== "function") {
          log.error("fail to change state");
        }
        callback();
      });
    }
  };

  on = (type: State, callback: () => void) => {
    if (!this._events[type]) {
      this._events[type] = [callback];
    } else {
      this._events[type]?.push(callback);
    }
  };

  resolvePathSimple = (...paths: string[]) =>
    paths.reduce((currentPiece, nextPiece) => {
      let piece = nextPiece.startsWith("/") ? nextPiece : "/" + nextPiece;
      piece = piece.endsWith("/")
        ? piece.substring(0, currentPiece.length - 1)
        : piece;
      return currentPiece + piece;
    });

  flatten = <T>(tree: Tree<T>): T[] =>
    tree.reduce((flat: T[], item: T | Tree<T>) => {
      if (Array.isArray(item)) {
        const flatChild = this.flatten(item);
        flat = flat.concat(flatChild);
      } else {
        flat.push(item);
      }
      return flat;
    }, []);

  send = async (
    client: Client,
    stream: Buffer | string | NodeJS.ReadableStream,
    destPath: PathLike
  ): Promise<boolean | void> => {
    log.info(`sending to ${destPath}...`);
    return await new Promise<boolean>((resolve, reject) => {
      client.put(stream, destPath as any, (error) => {
        if (error) {
          reject(error);
        }
        resolve(true);
      });
    }).catch((error: Error) => {
      log.error(error.message);
    });
  };

  private _getDirent = async (
    localPath: string
  ): Promise<fs.Dirent[] | void> => {
    const absoluteLocalPath = path.resolve(this.rootPath, localPath);
    return await new Promise<fs.Dirent[]>((resolve, reject) =>
      fs.readdir(
        absoluteLocalPath,
        { encoding: "utf-8", withFileTypes: true },
        (error, files) => {
          if (error) {
            reject(error);
          }
          resolve(files);
        }
      )
    ).catch((error: Error) => {
      log.error(error.message);
    });
  };

  public traverseDictory = async (relativePath: string = ""): Promise<void> => {
    const absoluteLocalPath = this.resolvePathSimple(
      this.rootPath,
      relativePath
    );
    const direntList = await this._getDirent(absoluteLocalPath);
    // const direntMap: TreeMap = new Map();
    if (direntList) {
      for (const dirent of direntList) {
        const direntPath = this.resolvePathSimple(relativePath, dirent.name);
        if (dirent.isFile()) {
          this.filesMap.set(direntPath, Deployer.isFile);
        } else if (dirent.isDirectory()) {
          this.filesMap.set(direntPath, Deployer.isDictory);
          await this.traverseDictory(direntPath);
        }
      }
    }
  };

  getFileBuffer = async (
    dir: string,
    options?:
      | {
          encoding?: null | undefined;
          flag?: string | undefined;
        }
      | undefined
      | null
  ): Promise<Buffer | void> => {
    log.info(`reading ${dir}`);
    return await new Promise<Buffer>((resolve, reject) => {
      fs.readFile(
        path.resolve(process.cwd(), dir),
        options,
        (err: NodeJS.ErrnoException | null, data: Buffer) => {
          if (err) {
            reject(err);
          }
          resolve(data);
        }
      );
    }).catch((error: Error) => {
      log.error(error.message);
    });
  };

  public deploy = async () => {
    this.client.on("ready", async () => {
      const { host, remotePath } = this.options;
      console.log(`\x1b[92m--- connected to ${host} ---\x1b[0m`);
      await this.client.mkdir(remotePath, (error: Error) => {
        // log.error(`Fail to create dir: ${error?.message}`);
      });

      for (const [dirent, type] of this.filesMap) {
        if (type === Deployer.isDictory) {
          const remoteDir = this.resolvePathSimple(remotePath, dirent);
          await this.client.mkdir(remoteDir, (error: Error) => {
            // log.error(`Fail to create dir: ${error?.message}`);
          });
        } else if (type === Deployer.isFile) {
          const filepath = this.resolvePathSimple(this.rootPath, dirent);
          const stream = await this.getFileBuffer(filepath);
          const remote = this.resolvePathSimple(remotePath, dirent);
          if (stream) {
            await this.send(this.client, stream, remote);
          }
        }
      }

      this.client.end();
    });
    this.client.connect(this.options);
  };
}

export default Deployer;
