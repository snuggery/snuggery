/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-snuggery",
factory: function (require) {
"use strict";var plugin=(()=>{var me=Object.create;var C=Object.defineProperty;var ge=Object.getOwnPropertyDescriptor;var he=Object.getOwnPropertyNames;var we=Object.getPrototypeOf,ye=Object.prototype.hasOwnProperty;var ke=(r,e,s)=>e in r?C(r,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):r[e]=s;var l=(r=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(r,{get:(e,s)=>(typeof require<"u"?require:e)[s]}):r)(function(r){if(typeof require<"u")return require.apply(this,arguments);throw new Error('Dynamic require of "'+r+'" is not supported')});var Pe=(r,e)=>{for(var s in e)C(r,s,{get:e[s],enumerable:!0})},se=(r,e,s,f)=>{if(e&&typeof e=="object"||typeof e=="function")for(let g of he(e))!ye.call(r,g)&&g!==s&&C(r,g,{get:()=>e[g],enumerable:!(f=ge(e,g))||f.enumerable});return r};var oe=(r,e,s)=>(s=r!=null?me(we(r)):{},se(e||!r||!r.__esModule?C(s,"default",{value:r,enumerable:!0}):s,r)),xe=r=>se(C({},"__esModule",{value:!0}),r);var U=(r,e,s)=>(ke(r,typeof e!="symbol"?e+"":e,s),s);var De={};Pe(De,{default:()=>ve});var ne=l("@yarnpkg/cli"),M=l("@yarnpkg/core"),ie=l("clipanion");var j=class extends ne.BaseCommand{args=ie.Option.Proxy();async execute(){let e=await M.Configuration.find(this.context.cwd,this.context.plugins),{project:s,workspace:f}=await M.Project.find(e,this.context.cwd);await s.restoreInstallState();let g=M.structUtils.makeIdent("snuggery","snuggery").identHash,i=[s.topLevelWorkspace];f!=null&&i.unshift(f);for(let[h,m]of i.entries())if(!!s.storedPackages.get(m.anchoredLocator.locatorHash)?.dependencies.has(g)){if(h===0&&M.scriptUtils.hasWorkspaceScript(m,"sn"))break;return await M.scriptUtils.executePackageAccessibleBinary(m.anchoredLocator,"sn",this.args,{cwd:this.context.cwd,project:s,stdin:this.context.stdin,stdout:this.context.stdout,stderr:this.context.stderr})}return this.cli.run(["run","sn",...this.args])}};U(j,"paths",[["sn"]]);var de=l("@yarnpkg/cli"),n=l("@yarnpkg/core"),k=l("@yarnpkg/fslib"),q=l("@yarnpkg/plugin-pack"),K=l("clipanion");var v=l("@yarnpkg/core"),z=l("@yarnpkg/fslib"),R=l("@yarnpkg/plugin-essentials"),ce=oe(l("semver"));function J(r,e,s){return Object.create(r,{cwd:{value:e,writable:!1,configurable:!0},manifest:{value:v.Manifest.fromText(JSON.stringify(s)),writable:!1,configurable:!0}})}function pe(r){return z.xfs.mktempPromise(async e=>{let s=new z.CwdFS(e);return await v.tgzUtils.extractArchiveTo(r,s,{stripComponents:1}),v.Manifest.fromText(await s.readFilePromise(v.Manifest.fileName,"utf8"))})}var ae="npm:";function Y({range:r}){if(r.startsWith(ae)&&(r=r.slice(ae.length)),/^[a-z]+:/.test(r)||r.includes("||")||r.includes("&&")||!v.semverUtils.validRange(r))return R.suggestUtils.Modifier.EXACT;switch(r[0]){case"^":return R.suggestUtils.Modifier.CARET;case"~":return R.suggestUtils.Modifier.TILDE;default:return R.suggestUtils.Modifier.EXACT}}function le(r,e){let s=Y(e);if(s!==R.suggestUtils.Modifier.EXACT)return R.suggestUtils.applyModifier(r,s);let{protocol:f,source:g,selector:i,params:h}=v.structUtils.parseRange(r.range),m=/^\s*>=\s*0\.(\d\d)\d\d(?:.[^ <]+)?\s*<\s*0\.(\d\d)00(?:\.0)?\s*$/.exec(e.range),x=/^0\.(\d\d)\d\d(?:\.\d+)?$/.exec(i);return ce.valid(i)&&x!=null&&m!=null&&+m[2]==+m[1]+1?v.structUtils.makeDescriptor(r,v.structUtils.makeRange({protocol:f,source:g,selector:`>= ${i} < 0.${x[1]}00.0`,params:h})):r}var O=class extends de.BaseCommand{json=K.Option.Boolean("--json");directory=K.Option.String({required:!0});async execute(){let e=await n.Configuration.find(this.context.cwd,this.context.plugins);return(await n.StreamReport.start({configuration:e,stdout:this.context.stdout,includeFooter:!1,includeInfos:!0,json:this.json},async f=>{let{project:g,workspace:i}=await n.Project.find(e,this.context.cwd);if(!i){f.reportError(n.MessageName.UNNAMED,"Couldn't find workspace");return}if(i.manifest.name==null){f.reportError(n.MessageName.UNNAMED,`Package at ${n.formatUtils.pretty(e,i.relativeCwd,n.formatUtils.Type.PATH)} doesn't have a name`);return}let h=k.ppath.join(g.cwd,"dist");await k.xfs.mkdirPromise(h,{recursive:!0}),await g.restoreInstallState();let m=k.ppath.join(h,`${n.structUtils.slugifyIdent(i.manifest.name)}.tgz`),x=k.ppath.resolve(i.cwd,k.npath.toPortablePath(this.directory));if(!await k.xfs.existsPromise(x)){f.reportError(n.MessageName.UNNAMED,`Build package ${n.formatUtils.pretty(e,i.manifest.name,n.formatUtils.Type.IDENT)} first`);return}let P=await k.xfs.readJsonPromise(k.ppath.join(x,k.Filename.manifest)),b=n.structUtils.parseIdent(P.name);if(b.identHash!==i.anchoredDescriptor.identHash){f.reportError(n.MessageName.UNNAMED,`Invalid distribution folder: found package ${n.formatUtils.pretty(e,b,n.formatUtils.Type.IDENT)} but expected ${n.formatUtils.pretty(e,i.anchoredDescriptor,n.formatUtils.Type.IDENT)}`);return}let H=J(i,x,P),E=await q.packUtils.genPackStream(H,await q.packUtils.genPackList(H));await k.xfs.writeFilePromise(m,await n.miscUtils.bufferStream(E)),f.reportInfo(null,`Packed ${n.formatUtils.pretty(e,b,n.formatUtils.Type.IDENT)} into ${n.formatUtils.pretty(e,m,n.formatUtils.Type.PATH)}`)})).exitCode()}};U(O,"paths",[["snuggery-workspace","pack"]]);var fe=l("@yarnpkg/cli"),d=l("@yarnpkg/core"),W=l("@yarnpkg/fslib"),N=l("@yarnpkg/plugin-npm"),V=l("clipanion");var L=class extends fe.BaseCommand{tag=V.Option.String("--tag","latest");json=V.Option.Boolean("--json");async execute(){let e=await d.Configuration.find(this.context.cwd,this.context.plugins);return(await d.StreamReport.start({configuration:e,stdout:this.context.stdout,json:this.json,includeInfos:!0},async f=>{let{project:g,workspace:i}=await d.Project.find(e,this.context.cwd);if(!i){f.reportError(d.MessageName.UNNAMED,"Couldn't find workspace");return}if(i.manifest.name===null||i.manifest.version===null){f.reportError(d.MessageName.UNNAMED,"Workspaces must have valid names and versions to be published on an external registry");return}let h=i.manifest.name,m=W.ppath.join(g.cwd,"dist",`${d.structUtils.slugifyIdent(h)}.tgz`);if(!await W.xfs.existsPromise(m)){f.reportError(d.MessageName.UNNAMED,`Pack package ${d.formatUtils.pretty(e,h,d.formatUtils.Type.IDENT)} first`);return}let x=await W.xfs.readFilePromise(m),P=await pe(x);if(P.name==null||P.name.identHash!==h.identHash){f.reportError(d.MessageName.UNNAMED,`Tarball for package ${P.name&&d.formatUtils.pretty(e,P.name,d.formatUtils.Type.IDENT)} cannot be published in workspace for ${d.formatUtils.pretty(e,h,d.formatUtils.Type.IDENT)}`);return}let b=N.npmConfigUtils.getPublishRegistry(P,{configuration:e}),H=await N.npmPublishUtils.makePublishBody(J(i,i.cwd,P.raw),x,{access:void 0,tag:this.tag,registry:b});try{await N.npmHttpUtils.put(N.npmHttpUtils.getIdentUrl(h),H,{configuration:e,registry:b,ident:h,jsonResponse:!0})}catch(E){if(E.name!=="HTTPError")throw E;{let B=E.response.body&&E.response.body.error?E.response.body.error:`The remote server answered with HTTP ${E.response.statusCode} ${E.response.statusMessage}`;f.reportError(d.MessageName.NETWORK_ERROR,B)}}f.hasErrors()||f.reportInfo(null,`Published ${d.formatUtils.pretty(e,d.structUtils.makeDescriptor(h,P.version),d.formatUtils.Type.DESCRIPTOR)}`)})).exitCode()}};U(L,"paths",[["snuggery-workspace","publish"]]);var X=l("@yarnpkg/cli"),t=l("@yarnpkg/core"),D=l("@yarnpkg/fslib"),A=l("@yarnpkg/plugin-essentials"),Q=l("@yarnpkg/plugin-npm"),G=l("clipanion"),$=oe(l("semver"));var Ee="migrations.json",F=class extends X.BaseCommand{patterns=G.Option.Rest();async execute(){let e=await t.Configuration.find(this.context.cwd,this.context.plugins),{project:s,workspace:f}=await t.Project.find(e,this.context.cwd),g=await t.Cache.find(e);if(!f)throw new X.WorkspaceRequiredError(s.cwd,this.context.cwd);await s.restoreInstallState();let i=[A.suggestUtils.Strategy.PROJECT,A.suggestUtils.Strategy.LATEST],h=[],m=[],x=e.get("defaultProtocol"),P=o=>{let u=t.structUtils.parseRange(o.range);u.protocol||(u.protocol=x,o=t.structUtils.makeDescriptor(o,t.structUtils.makeRange(u)));let p=s.storedResolutions.get(o.descriptorHash);if(p==null)throw new Error(`Assertion failed: expected ${t.structUtils.stringifyDescriptor(o)} to be resolved`);let a=s.storedPackages.get(p);if(!a)throw new Error(`Assertion failed: expected ${t.structUtils.stringifyDescriptor(o)} to be installed, try running an installation`);return a};for(let o of this.patterns){let u=!1,p=t.structUtils.parseDescriptor(o);for(let a of s.workspaces)for(let w of[A.suggestUtils.Target.REGULAR,A.suggestUtils.Target.DEVELOPMENT]){if(!a.manifest.getForScope(w).has(p.identHash))continue;let y=a.manifest[w].get(p.identHash);if(typeof y>"u")throw new Error("Assertion failed: Expected the descriptor to be registered");h.push(Promise.resolve().then(async()=>[a,w,y,await A.suggestUtils.getSuggestedDescriptors(p,{project:s,workspace:a,cache:g,target:w,modifier:Y(p),strategies:i,fixed:!0})])),u=!0}u||m.push(o)}if(m.length>1)throw new G.UsageError(`Patterns ${t.formatUtils.prettyList(e,m,t.formatUtils.Type.CODE)} don't match any packages referenced by any workspace`);if(m.length>0)throw new G.UsageError(`Pattern ${t.formatUtils.prettyList(e,m,t.formatUtils.Type.CODE)} doesn't match any packages referenced by any workspace`);let b=await Promise.all(h),H=await t.LightReport.start({configuration:e,stdout:this.context.stdout,suggestInstall:!1},async o=>{for(let[,,u,{suggestions:p,rejections:a}]of b){let w=p.filter(y=>y.descriptor!==null);if(w.length===0){let[y]=a;if(typeof y>"u")throw new Error("Assertion failed: Expected an error to have been set");let T=this.cli.error(y);s.configuration.get("enableNetwork")?o.reportError(t.MessageName.CANT_SUGGEST_RESOLUTIONS,`${t.structUtils.prettyDescriptor(e,u)} can't be resolved to a satisfying range

${T}`):o.reportError(t.MessageName.CANT_SUGGEST_RESOLUTIONS,`${t.structUtils.prettyDescriptor(e,u)} can't be resolved to a satisfying range (note: network resolution has been disabled)

${T}`)}else w.length>1&&o.reportError(t.MessageName.CANT_SUGGEST_RESOLUTIONS,`${t.structUtils.prettyDescriptor(e,u)} has multiple possible upgrade strategies; are you trying to update a local package?`)}});if(H.hasErrors())return H.exitCode();let E=[],B=e.makeResolver(),Z=new Map,ee=new Map,te=async o=>{let u=await Q.npmHttpUtils.get(Q.npmHttpUtils.getIdentUrl(o),{configuration:e,ident:o,jsonResponse:!0}),p="version"in o&&o.version?o.version:$.clean(t.structUtils.parseRange(o.reference).selector),a=u.versions[p];if(a==null)throw new Error(`Assertion failed: version ${p} not found in registry`);return a},re=await t.LightReport.start({configuration:e,stdout:this.context.stdout,suggestInstall:!1},async o=>{for(let[u,p,,{suggestions:a}]of b){let w=a.find(c=>c.descriptor!=null).descriptor,y=u.manifest[p].get(w.identHash);if(typeof y>"u")throw new Error("Assertion failed: This descriptor should have a matching entry");if(y.descriptorHash===w.descriptorHash)continue;let T=Z.get(w.descriptorHash);if(T==null){let c=await B.getCandidates(w,{},{project:s,report:o,resolver:B});if(c.length===0)throw new Error("Assertion failed: candidate has to be found");let I=(await te(c[0]))["ng-update"]?.packageGroup;Array.isArray(I)?T=I.map(S=>t.structUtils.makeDescriptor(t.structUtils.parseIdent(S),w.range)):typeof I=="object"&&I!=null?T=Object.entries(I).map(([S,ue])=>t.structUtils.makeDescriptor(t.structUtils.parseIdent(S),`${ue}`)):T=[w];for(let{descriptorHash:S}of T)Z.set(S,T)}for(let c of T){let _=u.manifest[p].get(c.identHash);if(_==null)continue;u.manifest[p].set(c.identHash,c);let I=u.manifest.peerDependencies.get(c.identHash);I!=null&&u.manifest.peerDependencies.set(c.identHash,le(c,I)),E.push([u,p,_,c]),ee.set(P(_),c)}}});return re.hasErrors()?re.exitCode():(await e.triggerMultipleHooks(o=>o.afterWorkspaceDependencyReplacement,E),(await t.StreamReport.start({configuration:e,stdout:this.context.stdout},async o=>{await s.install({cache:g,report:o,mode:t.InstallMode.UpdateLockfile}),await o.startTimerPromise("Preparing migration",async()=>{let u=D.ppath.join(s.cwd,Ee),p=new Map;if(await D.xfs.existsPromise(u))for(let a of await D.xfs.readJsonPromise(u))p.set(t.structUtils.parseIdent(a.package).identHash,a);for(let[a,w]of ee){let y=P(w),T=t.structUtils.stringifyIdent(a);if(!(await te(y))["ng-update"]?.migrations)continue;let c=p.get(a.identHash);c!=null?(a.version&&$.lt(a.version,c.from)&&(c.from=a.version,delete c.includedMigrations,delete c.skippedMigrations),y.version&&$.gt(y.version,c.to)&&(c.to=y.version,delete c.includedMigrations,delete c.skippedMigrations)):(c={package:T,from:a.version??"unknown",to:y.version??"unknown"},p.set(a.identHash,c))}p.size&&await D.xfs.writeJsonPromise(u,Array.from(p.values())),o.reportInfo(null,`Changes have been made to the ${t.formatUtils.pretty(e,D.Filename.manifest,t.formatUtils.Type.PATH)} files and to ${t.formatUtils.pretty(e,D.Filename.lockfile,t.formatUtils.Type.PATH)} and the new packages have been downloaded, but no packages have been installed yet into ${t.formatUtils.pretty(e,D.Filename.nodeModules,t.formatUtils.Type.PATH)} or ${t.formatUtils.pretty(e,D.Filename.pnpCjs,t.formatUtils.Type.PATH)}.`),o.reportInfo(null,`You can add extra migrations by executing ${t.formatUtils.pretty(e,"`yarn sn run update <package@version> [...package@version]`",t.formatUtils.Type.CODE)} again.`),o.reportInfo(null,"If you are ready to apply the update, continue with the instructions below."),o.reportInfo(null,`First, check whether everything looks okay and perform the actual installation via ${t.formatUtils.pretty(e,"`yarn install`",t.formatUtils.Type.CODE)}`),p.size&&o.reportInfo(null,`Then, continue with executing the migrations. Run ${t.formatUtils.pretty(e,"`yarn sn help update`",t.formatUtils.Type.CODE)} for instructions.`)})})).exitCode())}};U(F,"paths",[["snuggery-workspace","up"]]);var Te={commands:[j,...process.env.SNUGGERY_YARN==="1"?[O,L,F]:[]],hooks:{setupScriptEnvironment(r,e,s){return s("sn",process.execPath,[process.argv[1],"sn"])}}},ve=Te;return xe(De);})();
return plugin;
}
};
