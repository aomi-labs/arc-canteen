import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { ExternalLink } from "@/components/site-shell";
import { build } from "@/content/build";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Build on Aomi",
  description:
    "Every Aomi developer surface with the exact commands: Portal, CLI, Skills, MCP, Rust SDK, Build platform, widget, API and Telegram.",
};

function Code({ children }: { children: string }) {
  return <CodeWindow code={children} />;
}

function RefTable({ rows }: { rows: ReadonlyArray<{ left: string; right: string }> }) {
  return (
    <div className="ref-table" role="table">
      {rows.map((row) => (
        <div className="ref-row" role="row" key={row.left}>
          <span className="ref-left" role="cell">{row.left}</span>
          <span className="ref-right" role="cell">{row.right}</span>
        </div>
      ))}
    </div>
  );
}

export default function BuildPage() {
  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/">Home</Link>
          <p className="eyebrow">{build.eyebrow}</p>
          <h1>{build.headline}</h1>
          <p>{build.intro}</p>
          <p>{build.pluginNote}</p>
        </div>
      </div>
      <div className="page-content">
        <div className="container">
          <div className="recipe-detail" id="doors" style={{ marginTop: 0 }}>
            <h2>Six doors into the same pipeline</h2>
            <div className="ref-table" role="table">
              {build.doors.map((door) => (
                <div className="ref-row" role="row" key={door.door}>
                  <Link className="ref-left" role="cell" href={door.href}>{door.door}</Link>
                  <span className="ref-right" role="cell">{door.who}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="recipe-detail" id="cli">
            <p className="eyebrow">Client CLI</p>
            <h2>{build.cli.title}</h2>
            <p>{build.cli.intro}</p>
            <h3>{build.cli.installTitle}</h3>
            <Code>{build.cli.installCode}</Code>
            <p>{build.cli.installNote}</p>
            <h3>{build.cli.loopTitle}</h3>
            <Code>{build.cli.loopCode}</Code>
            <p>{build.cli.loopNote}</p>
            <h3>{build.cli.walletsTitle}</h3>
            <Code>{build.cli.walletsCode}</Code>
            <p>{build.cli.walletsNote}</p>
            <h3>{build.cli.moreTitle}</h3>
            <RefTable rows={build.cli.more.map((item) => ({ left: item.command, right: item.what }))} />
            <p>{build.cli.envNote}</p>
          </div>

          <div className="recipe-detail" id="skills">
            <p className="eyebrow">Agent Skills</p>
            <h2>{build.skills.title}</h2>
            <p>{build.skills.intro}</p>
            <RefTable rows={build.skills.table.map((item) => ({ left: item.skill, right: item.teaches }))} />
            <Code>{build.skills.installCode}</Code>
            <p>{build.skills.installNote}</p>
            <h3>{build.skills.safetyTitle}</h3>
            <ul className="resource-list">
              {build.skills.safety.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p>{build.skills.drainNote}</p>
          </div>

          <div className="recipe-detail" id="mcp">
            <p className="eyebrow">MCP</p>
            <h2>{build.mcp.title}</h2>
            <p>{build.mcp.intro}</p>
            <RefTable
              rows={build.mcp.resources.map((item) => ({
                left: `${item.resource} · ${item.prod}`,
                right: item.use,
              }))}
            />
            <h3>{build.mcp.connectTitle}</h3>
            <Code>{build.mcp.connectCode}</Code>
            <p>{build.mcp.connectNote}</p>
            <h3>{build.mcp.agentToolsTitle}</h3>
            <RefTable rows={build.mcp.agentTools.map((item) => ({ left: item.tool, right: item.what }))} />
            <h3>{build.mcp.superviseTitle}</h3>
            <p>{build.mcp.superviseBody}</p>
            <h3>{build.mcp.pipelineTitle}</h3>
            <Code>{build.mcp.pipelineCode}</Code>
            <p>{build.mcp.pipelineBody}</p>
            <h3>{build.mcp.authTitle}</h3>
            <p>{build.mcp.authBody}</p>
            <RefTable rows={build.mcp.symptoms.map((item) => ({ left: item.symptom, right: item.check }))} />
          </div>

          <div className="recipe-detail" id="rust-sdk">
            <p className="eyebrow">Rust SDK</p>
            <h2>{build.rust.title}</h2>
            <p>{build.rust.intro}</p>
            <div className="step-list">
              {build.rust.steps.map((step, index) => (
                <section className="step-row" key={step.title}>
                  <span className="number">0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    {"body" in step ? <p>{step.body}</p> : null}
                    <Code>{step.code}</Code>
                  </div>
                </section>
              ))}
            </div>
            <h3>{build.rust.gotchasTitle}</h3>
            <ul className="resource-list">
              {build.rust.gotchas.map((item) => <li key={item.slice(0, 24)}>{item}</li>)}
            </ul>
            <div className="note-panel">
              <p>{build.rust.designNote}</p>
            </div>
          </div>

          <div className="recipe-detail" id="platform">
            <p className="eyebrow">Build platform</p>
            <h2>{build.platform.title}</h2>
            <p>{build.platform.intro}</p>
            <RefTable rows={build.platform.words.map((item) => ({ left: item.word, right: item.meaning }))} />
            <div className="step-list">
              {build.platform.steps.map((step, index) => (
                <section className="step-row" key={step.title}>
                  <span className="number">0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </section>
              ))}
            </div>
            <h3>{build.platform.keysTitle}</h3>
            <p>{build.platform.keysBody}</p>
            <h3>{build.platform.sdkUpgradeTitle}</h3>
            <p>{build.platform.sdkUpgradeBody}</p>
            <div className="note-panel">
              <p>{build.platform.orgNote}</p>
            </div>
          </div>

          <div className="recipe-detail" id="widget">
            <p className="eyebrow">Widget</p>
            <h2>{build.widget.title}</h2>
            <p>{build.widget.intro}</p>
            <h3>{build.widget.installTitle}</h3>
            <Code>{build.widget.installCode}</Code>
            <h3>{build.widget.envTitle}</h3>
            <p>{build.widget.envBody}</p>
            <Code>{build.widget.envCode}</Code>
            <h3>{build.widget.mountTitle}</h3>
            <p>{build.widget.mountBody}</p>
            <Code>{build.widget.mountCode}</Code>
            <p>{build.widget.ownership}</p>
          </div>

          <div className="recipe-detail" id="sdk-api">
            <p className="eyebrow">Client SDK and REST API</p>
            <h2>{build.sdkApi.title}</h2>
            <p>{build.sdkApi.intro}</p>
            <h3>{build.sdkApi.tsTitle}</h3>
            <Code>{build.sdkApi.tsCode}</Code>
            <p>{build.sdkApi.tsNote}</p>
            <div className="note-panel">
              <p>{build.sdkApi.originMainNote}</p>
            </div>
            <h3>{build.sdkApi.httpTitle}</h3>
            <Code>{build.sdkApi.httpCode}</Code>
            <p>{build.sdkApi.httpNote}</p>
          </div>

          <div className="recipe-detail" id="telegram">
            <p className="eyebrow">Telegram bots</p>
            <h2>{build.telegram.title}</h2>
            <p>{build.telegram.intro}</p>
            <div className="step-list">
              {build.telegram.steps.map((step, index) => (
                <section className="step-row" key={step.title}>
                  <span className="number">0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </section>
              ))}
            </div>
            <h3>{build.telegram.commandsTitle}</h3>
            <RefTable rows={build.telegram.commands.map((item) => ({ left: item.command, right: item.what }))} />
            <p>{build.telegram.examplesNote}</p>
          </div>

          <div className="recipe-detail" id="security">
            <p className="eyebrow">Security</p>
            <h2>{build.security.title}</h2>
            <p>{build.security.intro}</p>
            <RefTable
              rows={build.security.actors.map((item) => ({
                left: item.actor,
                right: `${item.controls} / Cannot: ${item.cannot}`,
              }))}
            />
            <h3>{build.security.controlsTitle}</h3>
            <ul className="resource-list">
              {build.security.controls.map((item) => <li key={item.slice(0, 24)}>{item}</li>)}
            </ul>
            <div className="note-panel">
              <p>{build.security.simLimits}</p>
              <p>
                <ExternalLink href={site.links.permissionModel}>Permission model</ExternalLink>
                {" · "}
                <ExternalLink href={site.links.transactionSafety}>Transaction safety</ExternalLink>
              </p>
            </div>
          </div>

          <div className="recipe-detail" id="examples">
            <p className="eyebrow">Examples</p>
            <h2>{build.examples.title}</h2>
            <p>{build.examples.intro}</p>
            <div className="example-list">
              {build.examples.cases.map((item) => (
                <article className="example-row" key={item.name}>
                  <h3>{item.name}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <p>Teams in production: {build.examples.teams.join(" · ")}.</p>
            <p>{build.examples.stats}</p>
          </div>

          <div className="resource-panel" id="help">
            <h3>{build.help.title}</h3>
            <p>{build.help.intro}</p>
            <div className="resource-links">
              {build.help.links.map((item) => (
                <ExternalLink key={item.label} href={item.href}>{item.label}</ExternalLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
