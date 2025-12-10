# Dependency Injection Libraries for Deno/TypeScript

## Executive Summary

This report evaluates five dependency injection (DI) libraries compatible with
Deno and TypeScript. While Fresh has no built-in DI pattern, several third-party
libraries can be integrated. The best fit depends on your project's needs:
decorator-heavy frameworks (TSyringe, Diosaur), lightweight solutions
(deno-dependency-injector, Needle DI), or full frameworks with DI included
(Alosaur, Danet).

---

## Evaluated Libraries

### 1. **deno-dependency-injector**

**Repository:**
[GitHub - cmd-johnson/deno-dependency-injector](https://github.com/cmd-johnson/deno-dependency-injector)

**Best For:** Minimal, pragmatic DI needs with straightforward patterns

#### Strengths

- **Lightweight and simple** - Extremely low overhead, easy to understand
- **Deno-native** - Built specifically for Deno, no compatibility concerns
- **Decorator-based** - Uses standard `@Injectable()` and `@Bootstrapped()`
  decorators
- **100% test coverage** - Well-tested codebase
- **Constructor injection** - Clean, type-safe constructor parameter injection
- **Singleton/instance control** - Easy configuration of dependency lifecycles
- **Testing support** - Supports dependency mocking via constructor parameter
  replacement

#### Weaknesses

- **Limited features** - No advanced patterns (property injection, factory
  functions)
- **Smaller community** - Less documentation and fewer examples than larger
  projects
- **Minimal configuration** - Might feel restrictive for complex scenarios

#### Typical Usage

```typescript
@Injectable()
class DatabaseService {}

@Injectable()
class UserRepository {
  constructor(private db: DatabaseService) {}
}

@Bootstrapped()
class App {
  constructor(private users: UserRepository) {}
}

const app = bootstrap(App);
```

---

### 2. **Needle DI**

**Repository:** [JSR - @needle-di/core](https://jsr.io/@needle-di/core)

**Best For:** Lightweight, efficient dependency injection with modern tooling

#### Strengths

- **JSR published** - Modern, officially published package on JSR (not just npm)
- **TypeScript-first design** - Optimized for TypeScript projects
- **Lightweight and efficient** - Minimal bundle size impact
- **Deno compatible** - Works seamlessly with Deno
  (`deno add jsr:@needle-di/core`)
- **Well-designed** - Clean API, good documentation

#### Weaknesses

- **Still emerging** - Newer library with smaller community than established
  alternatives
- **Limited ecosystem** - Fewer integrations and third-party tools
- **Documentation gaps** - Fewer tutorials and examples compared to mature
  libraries

#### Installation

```bash
deno add jsr:@needle-di/core
```

---

### 3. **Diosaur**

**Repository:** [GitHub - ovesco/diosaur](https://github.com/ovesco/diosaur)

**Best For:** Deno/Node universal projects requiring minimal boilerplate

#### Strengths

- **Dual platform** - Works with both Deno and Node.js
- **Decorator-based** - Uses `@Service()` and `@Inject()` decorators
- **Minimal configuration** - Auto-infers dependencies from TypeScript
  reflection
- **Multiple injection types** - Supports constructor-based and property-based
  injection
- **Lightweight** - Small library with minimal overhead

#### Weaknesses

- **TypeScript required** - Cannot be used with raw JavaScript
- **Reflection dependency** - Requires `reflect-metadata` library
- **Limited scope** - Fewer advanced features than enterprise DI containers
- **Smaller community** - Less documentation than mainstream alternatives

#### Typical Usage

```typescript
@Service()
class Logger {}

@Service()
class UserService {
  @Inject()
  private logger!: Logger;
}

const userService = getContainer().get(UserService);
```

---

### 4. **TSyringe** (Microsoft)

**Repository:**
[GitHub - microsoft/tsyringe](https://github.com/microsoft/tsyringe)

**Best For:** Enterprise-grade projects needing advanced lifecycle management
and scoping

#### Strengths

- **Microsoft-backed** - Professional support and active maintenance
- **Advanced scoping** - Four lifecycle scopes: Transient, Singleton,
  ResolutionScoped, ContainerScoped
- **Rich decorator set** - `@injectable()`, `@singleton()`, `@autoInjectable()`,
  `@scoped()`, `@injectAll()`, transforms
- **Child containers** - Support for container hierarchies
- **Well-documented** - Comprehensive documentation and examples
- **Production-ready** - Widely used in enterprise applications
- **Deno support** - Can be used with Deno via npm compatibility

#### Weaknesses

- **Deno Deploy limitations** - TC39 decorators have known issues on Deno Deploy
- **Decorator complexity** - More decorators to learn than simpler alternatives
- **Requires polyfills** - Needs Reflect API in some environments
- **Heavier than minimalist options** - Not ideal for very lightweight projects

#### Typical Usage

```typescript
@injectable()
class DatabaseService {}

@injectable()
class UserRepository {
  constructor(private db: DatabaseService) {}
}

container.registerSingleton(UserRepository);
const repo = container.resolve(UserRepository);
```

---

### 5. **injection-js** (Angular-derived)

**Repository:**
[GitHub - mgechev/injection-js](https://github.com/mgechev/injection-js)

**Best For:** Projects that benefit from Angular's DI patterns

#### Strengths

- **Angular-based design** - Proven, well-tested patterns from Angular framework
- **Lightweight** - Only ~5.2KB minified
- **Multiple syntaxes** - Supports TypeScript decorators, ES6 classes, and ES5
- **ReflectiveInjector** - Hierarchical injection tree support
- **Feature-complete** - "Fast, reliable and well tested"

#### Weaknesses

- **Deno compatibility unclear** - No explicit Deno support mentioned, focus is
  on Node.js/browsers
- **Documentation minimal** - Less comprehensive documentation than TSyringe
- **Smaller community** - Fewer modern examples and tutorials
- **May require polyfills** - Reflect API dependencies might be problematic in
  Deno

#### Typical Usage

```typescript
@Injectable()
class DatabaseService {}

const injector = ReflectiveInjector.resolveAndCreate([
  DatabaseService,
  UserRepository,
]);
const repo = injector.get(UserRepository);
```

---

## Framework-Integrated Solutions

### Alosaur & Danet

**Alosaur:** [GitHub - alosaur/alosaur](https://github.com/alosaur/alosaur)
**Danet:** Full-stack Deno framework inspired by NestJS

Both are complete Deno web frameworks that include built-in dependency
injection. These are better suited if you're willing to switch frameworks
entirely, but overkill if you want to keep Fresh as your web framework.

---

## Comparison Matrix

| Library                  | Deno Native | JSR Published | Easy to Learn | Advanced Features | Community | Documentation |
| ------------------------ | ----------- | ------------- | ------------- | ----------------- | --------- | ------------- |
| deno-dependency-injector | ✓           | ✗             | ✓✓✓           | ✗                 | Small     | Basic         |
| Needle DI                | ✓           | ✓             | ✓✓            | ✓                 | Emerging  | Good          |
| Diosaur                  | ✓           | ✗             | ✓✓            | ✓                 | Small     | Basic         |
| TSyringe                 | ✓*          | ✗             | ✓             | ✓✓✓               | Large     | Excellent     |
| injection-js             | ?           | ✗             | ✓             | ✓✓                | Small     | Basic         |

*TSyringe has known issues with Deno Deploy

---

## Recommendations for grchat

### Option 1: Lightweight Approach (Recommended for Fresh)

**Use:** `deno-dependency-injector` or `Needle DI`

- Simple, Deno-native, minimal overhead
- Perfect for Fresh's lean philosophy
- Easy to understand and debug
- No vendor lock-in

**When to choose:** If grchat keeps its current architecture and just needs
basic DI for service management.

### Option 2: Enterprise-Grade Approach

**Use:** `TSyringe`

- Advanced scoping and lifecycle management
- Microsoft-backed, production-proven
- Rich feature set for complex applications
- Good documentation

**When to choose:** If grchat needs sophisticated dependency management,
hierarchical scopes, or plans significant complexity growth.

### Option 3: Universal Approach

**Use:** `Diosaur`

- Works with both Deno and Node.js if future flexibility needed
- Minimalist but feature-complete
- Property-based injection for flexibility

**When to choose:** If future Node.js compatibility is possible or desirable.

---

## Integration with Fresh

Fresh itself has **no built-in or recommended DI pattern**. Integration would
involve:

1. **Manual setup** in `main.ts` or a dedicated service layer
2. **Global singleton container** accessible throughout handlers/components
3. **Middleware** to inject dependencies into route handlers
4. **Component context** passing DI references to islands/components

### Suggested Pattern

```typescript
// services/container.ts
import {
  bootstrap,
  Injectable,
} from "jsr:@cmd-johnson/deno-dependency-injector";

@Injectable()
export class ChatService {
  // implementation
}

@Bootstrapped()
class ServiceContainer {
  constructor(public chat: ChatService) {}
}

export const container = bootstrap(ServiceContainer);

// routes/api/chat.ts
import { container } from "@/services/container.ts";

export const handler: Handlers = {
  POST: async (req: Request, ctx) => {
    const result = await container.chat.handleMessage(/* ... */);
    return Response.json(result);
  },
};
```

---

## Conclusion

For **grchat's current architecture**, `deno-dependency-injector` or `Needle DI`
are the best choices. Both are:

- Deno-native
- Simple and pragmatic
- Aligned with Fresh's philosophy of simplicity
- Sufficient for current needs

If future complexity warrants it, migrating to **TSyringe** would be
straightforward. Avoid `injection-js` due to unclear Deno compatibility.

---

## Sources

- [Needle DI - JSR](https://jsr.io/@needle-di/core)
- [deno-dependency-injector - GitHub](https://github.com/cmd-johnson/deno-dependency-injector)
- [Diosaur - GitHub](https://github.com/ovesco/diosaur)
- [TSyringe - GitHub](https://github.com/microsoft/tsyringe)
- [injection-js - GitHub](https://github.com/mgechev/injection-js)
- [Fresh Framework](https://fresh.deno.dev/)
- [DEV Community - TSyringe and DI](https://dev.to/gdsources/tsyringe-and-dependency-injection-in-typescript-3i67)
- [Deno Questions - DI Discussion](https://questions.deno.com/m/1189244206330421248)
