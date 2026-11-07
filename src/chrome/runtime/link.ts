import { replySchema } from "./message-event.ts";
import type { Reply } from "./message-event.ts";
import { Port } from "./port.ts";
import type { PortEnd } from "./port.ts";
import { jsonSchema } from "#src/messaging/json.js";
import type { Json } from "#src/messaging/json.js";
import { defineMessaging } from "#src/messaging/messaging.js";
import type { ProtocolWithReturn } from "#src/messaging/protocol-map.js";
import type { Transport } from "#src/state/transports/transport.js";
import { z } from "zod";

/** The four messages a link carries between two contexts of the app. */
const LinkMessage = {
  message: "runtime.message",
  connect: "runtime.connect",
  portMessage: "runtime.portMessage",
  portClose: "runtime.portClose"
} as const;

const identifierSchema = z.int().nonnegative();
const envelopeSchema = z.object({
  senderId: z.string(),
  message: jsonSchema
});
const connectSchema = z.object({
  senderId: z.string(),
  portId: identifierSchema,
  name: z.string()
});
// Which side opened the port says which table the receiver looks in, so both
// sides may open ports on one link without their numbers colliding.
const packetSchema = z.object({
  portId: identifierSchema,
  isFromConnector: z.boolean(),
  message: jsonSchema
});
const closeSchema = z.object({
  portId: identifierSchema,
  isFromConnector: z.boolean()
});

type Envelope = z.infer<typeof envelopeSchema>;
type Connect = z.infer<typeof connectSchema>;
type Packet = z.infer<typeof packetSchema>;
type Close = z.infer<typeof closeSchema>;

interface LinkProtocol {
  [LinkMessage.message]: ProtocolWithReturn<Envelope, Reply>;
  [LinkMessage.connect]: ProtocolWithReturn<Connect, void>;
  [LinkMessage.portMessage]: ProtocolWithReturn<Packet, void>;
  [LinkMessage.portClose]: ProtocolWithReturn<Close, void>;
}

/** What a link needs of the runtime that owns it. */
export interface LinkSetup {
  /** A transport to another context: a worker's port, stdio, memory. */
  readonly transport: Transport;

  /** This runtime's id, sent along so the other end knows who spoke. */
  readonly senderId: string;
  readonly timeoutMilliseconds?: number | undefined;

  /** Another context sent a message; answer it. */
  readonly onMessage: (envelope: Envelope) => Promise<Reply>;

  /** Another context opened a port. */
  readonly onConnect: (port: Port) => void;

  /** The transport closed. */
  readonly onClosed: () => void;
}

interface OpenPort {
  readonly port: Port;
  readonly end: PortEnd;
}

/**
 * The runtime's end of a transport to one other context: messages in both
 * directions, and the ports opened over it. Built on `defineMessaging`, so
 * request and answer framing, timeouts and a closed link are its own.
 */
export class RuntimeLink {
  private readonly messaging;
  private readonly senderId: string;
  private readonly opened = new Map<number, OpenPort>();
  private readonly accepted = new Map<number, OpenPort>();
  private nextPortId = 0;

  constructor(setup: LinkSetup) {
    this.senderId = setup.senderId;
    this.messaging = defineMessaging<LinkProtocol>({
      transport: setup.transport,
      ...setup.timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds: setup.timeoutMilliseconds },
      onClosed: () => {
        this.endAllPorts();
        setup.onClosed();
      }
    });

    this.messaging.onMessage(LinkMessage.message, ({ data }) => setup.onMessage(envelopeSchema.parse(data)));
    this.messaging.onMessage(LinkMessage.connect, ({ data }) => {
      const request = connectSchema.parse(data);
      const port = new Port({
        name: request.name,
        sender: {
          id: request.senderId
        }
      });
      const end = this.endFor({
        portId: request.portId,
        isFromConnector: false
      });
      this.accepted.set(request.portId, {
        port,
        end
      });
      port.attach(end);
      setup.onConnect(port);
    });
    this.messaging.onMessage(LinkMessage.portMessage, ({ data }) => {
      const packet = packetSchema.parse(data);
      this.tableFor(packet.isFromConnector).get(packet.portId)?.port.receive(packet.message);
    });
    this.messaging.onMessage(LinkMessage.portClose, ({ data }) => {
      const request = closeSchema.parse(data);
      const table = this.tableFor(request.isFromConnector);
      const entry = table.get(request.portId);
      table.delete(request.portId);
      entry?.port.detach({ end: entry.end });
    });
  }

  /**
   * Sends a message to the other context.
   *
   * @param message - A JSON value, or nothing.
   * @returns The other context's reply.
   */
  async send(message: Json) {
    const reply = await this.messaging.sendMessage(LinkMessage.message, {
      senderId: this.senderId,
      message
    });
    return replySchema.parse(reply);
  }

  /** Opens a port to the other context and adds it as one of `port`'s ways out. */
  open({ port, name }: {
    port: Port;
    name: string;
  }) {
    const portId = this.nextPortId;
    this.nextPortId += 1;
    const end = this.endFor({
      portId,
      isFromConnector: true
    });
    this.opened.set(portId, {
      port,
      end
    });
    port.attach(end);
    this.messaging.notify(LinkMessage.connect, {
      senderId: this.senderId,
      portId,
      name
    });
  }

  /** Closes the transport; the ports ending is the other side's news too. */
  close() {
    this.messaging.close();
    this.endAllPorts();
  }

  private tableFor(isFromConnector: boolean) {
    return isFromConnector ? this.accepted : this.opened;
  }

  private endFor({ portId, isFromConnector }: {
    portId: number;
    isFromConnector: boolean;
  }) {
    const end: PortEnd = {
      send: message => this.messaging.notify(LinkMessage.portMessage, {
        portId,
        isFromConnector,
        message
      }),
      close: () => {
        const table = isFromConnector ? this.opened : this.accepted;
        table.delete(portId);
        this.messaging.notify(LinkMessage.portClose, {
          portId,
          isFromConnector
        });
      }
    };
    return end;
  }

  private endAllPorts() {
    const entries = [...this.opened.values(), ...this.accepted.values()];
    this.opened.clear();
    this.accepted.clear();
    for (const { port, end } of entries) {
      port.detach({ end });
    }
  }
}
