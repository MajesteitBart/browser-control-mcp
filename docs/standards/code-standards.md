# Browser Control MCP - Code Standards

## General Principles

### Code Quality Standards
- **Type Safety**: All code MUST use TypeScript with strict type checking
- **Error Handling**: All async operations MUST include proper error handling
- **Documentation**: All public APIs and complex functions MUST include JSDoc comments
- **Testing**: All new features MUST include appropriate test coverage
- **Security**: All external communications MUST use authentication and validation

## TypeScript Standards

### File Structure
- Use `.ts` extension for all TypeScript files
- Organize imports in this order:
  1. Node.js built-in modules
  2. Third-party libraries
  3. Internal project modules
  4. Relative imports

### Type Definitions
- Define interfaces for all data structures
- Use strict typing - avoid `any` type
- Export types from `common/` package for shared use
- Use union types for message types and enums where appropriate

### Naming Conventions
- **Files**: kebab-case (e.g., `browser-api.ts`)
- **Classes**: PascalCase (e.g., `BrowserAPI`)
- **Functions/Variables**: camelCase (e.g., `openTab`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `WS_PORTS`)
- **Interfaces**: PascalCase with descriptive names (e.g., `ExtensionMessage`)

## MCP Server Standards

### Tool Definitions
- Tool names MUST use kebab-case (e.g., `open-browser-tab`)
- Tool descriptions MUST be clear and concise
- All parameters MUST use Zod schema validation
- Return consistent response format with `content` array

### Error Handling
- Use structured error responses with `isError: true`
- Include meaningful error messages
- Log errors appropriately for debugging
- Handle timeout scenarios gracefully

### WebSocket Communication
- All messages MUST include correlation IDs
- Implement request timeout (1000ms standard)
- Use shared secret authentication
- Handle connection failures gracefully

## Firefox Extension Standards

### WebExtension API Usage
- Use modern WebExtension APIs (avoid deprecated methods)
- Handle permission requirements explicitly
- Implement proper background script lifecycle
- Use content security policy compliant code

### Message Handling
- All extension messages MUST follow defined schemas
- Implement proper message validation
- Handle async operations with proper error catching
- Use correlation IDs for request tracking

## Build and Development Standards

### Nx Monorepo
- Each package MUST have its own `package.json`
- Use workspace dependencies for internal packages
- Maintain consistent versioning across related packages
- Follow Nx project structure conventions

### Build Configuration
- Use esbuild for extension bundling
- Maintain separate TypeScript configs per package
- Ensure build outputs are gitignored
- Use consistent build scripts across packages

### Testing Standards
- Use Jest for all testing
- Maintain test files in `__tests__/` directories
- Aim for >80% code coverage on critical paths
- Include both unit and integration tests
- Mock external dependencies appropriately

## Security Standards

### Authentication
- Use cryptographically secure shared secrets
- Implement proper secret validation
- Never log or expose secrets in error messages
- Use environment variables for configuration

### Communication Security
- Use localhost-only WebSocket connections
- Implement request correlation for tracking
- Set appropriate timeouts for all operations
- Validate all incoming messages against schemas

### Data Handling
- Sanitize all user inputs
- Validate all external data
- Use type-safe parsing (Zod schemas)
- Handle sensitive data appropriately

## Documentation Standards

### Code Documentation
- Use JSDoc for all public APIs
- Include parameter and return type documentation
- Document complex algorithms and business logic
- Maintain README files for each package

### API Documentation
- Document all MCP tools with examples
- Include error scenarios and responses
- Maintain version compatibility information
- Provide setup and configuration guides

## Version Management

### Semantic Versioning
- Follow semver for all package versions
- Coordinate version bumps across related packages
- Document breaking changes in CHANGELOG
- Tag releases appropriately

### Dependency Management
- Keep dependencies up to date
- Use exact versions for critical dependencies
- Regularly audit for security vulnerabilities
- Document dependency choices and alternatives

---
*Established: 2025-05-26*  
*Last Updated: 2025-05-26*