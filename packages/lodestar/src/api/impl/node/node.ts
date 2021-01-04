import {SyncingStatus} from "@chainsafe/lodestar-types";
import {createKeypairFromPeerId} from "@chainsafe/discv5";

import {NodeIdentity, NodePeer} from "../../types";
import {INetwork} from "../../../network";
import {IBeaconSync} from "../../../sync";

import {IApiOptions} from "../../options";
import {ApiNamespace, IApiModules} from "../interface";
import {filterByStateAndDirection, getPeerState} from "./utils";
import {INodeApi} from "./interface";

export class NodeApi implements INodeApi {
  public namespace = ApiNamespace.NODE;

  private readonly network: INetwork;
  private readonly sync: IBeaconSync;

  public constructor(opts: Partial<IApiOptions>, modules: Pick<IApiModules, "network" | "sync">) {
    this.namespace = ApiNamespace.BEACON;
    this.network = modules.network;
    this.sync = modules.sync;
  }

  public async getNodeIdentity(): Promise<NodeIdentity> {
    const enr = this.network.getEnr();
    const keypair = createKeypairFromPeerId(this.network.peerId);
    const discoveryAddresses = [] as string[];
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    if (enr?.getLocationMultiaddr("tcp")) discoveryAddresses.push(enr?.getLocationMultiaddr("tcp")?.toString()!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    if (enr?.getLocationMultiaddr("udp")) discoveryAddresses.push(enr?.getLocationMultiaddr("udp")?.toString()!);
    return {
      peerId: this.network.peerId.toB58String(),
      enr: enr?.encodeTxt(keypair.privateKey) || "",
      discoveryAddresses,
      p2pAddresses: this.network.localMultiaddrs.map((m) => m.toString()),
      metadata: this.network.metadata,
    };
  }

  public async getNodeStatus(): Promise<"ready" | "syncing" | "error"> {
    return (await this.sync.isSynced()) ? "ready" : "syncing";
  }

  public async getPeer(peerId: string): Promise<NodePeer | null> {
    return (await this.getPeers()).find((peer) => peer.peerId === peerId) || null;
  }

  public async getPeers(state: string[] = [], direction: string[] = []): Promise<NodePeer[]> {
    const nodePeers: NodePeer[] = [];
    // if direction includes "inbound" or "outbound", it means we want connected peers
    let peers =
      (state.length === 1 && state[0] === "connected") || direction.length > 0
        ? this.network.getPeers()
        : this.network.getAllPeers();
    peers = filterByStateAndDirection(peers, this.network, state, direction);
    for (const peer of peers) {
      const conn = this.network.getPeerConnection(peer.id);
      nodePeers.push({
        peerId: peer.id.toB58String(),
        //TODO: figure out how to get enr of peer
        enr: "",
        lastSeenP2pAddress: conn ? conn.remoteAddr.toString() : "",
        direction: conn ? conn.stat.direction : null,
        state: conn ? getPeerState(conn.stat.status) : "disconnected",
      });
    }
    return nodePeers;
  }

  public async getSyncingStatus(): Promise<SyncingStatus> {
    return this.sync.getSyncStatus();
  }

  public async getVersion(): Promise<string> {
    return `Lodestar/${process.env.npm_package_version || "dev"}`;
  }
}
