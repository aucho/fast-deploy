import DeployerSSH from "./DeployerSSH";
import DeployerFTP from "./DeployerFTP";
import { getConfig } from "./utils";

const start = async () => {
  const config = await getConfig();
  if (!config) {
    return;
  }
  let deployer: DeployerFTP | DeployerSSH;
  switch (config.serviceType) {
    case "ftp":
      deployer = new DeployerSSH(config);
    case "ssh":
    default:
      deployer = new DeployerSSH(config);
  }
  deployer.on("ready", () => {
    deployer?.deploy();
  });
};

start();
