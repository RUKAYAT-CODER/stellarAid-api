# StellarAid API - Comprehensive Codebase Overview

## 1. Architecture Overview

### Project Type
**NestJS Backend Framework** - A blockchain-enabled crowdfunding platform on Stellar network

### Technology Stack
- **Framework**: NestJS 11.0.1
- **Database**: PostgreSQL with TypeORM 11.0.0
- **Authentication**: Passport.js + JWT (15m expiry)
- **Email**: Nodemailer 8.0.1 with EJS templates
- **Logging**: Pino logger
- **File Storage**: AWS S3 integration
- **Validation**: class-validator + class-transformer
- **Documentation**: Swagger/OpenAPI

### Module Organization
The application is organized into functional modules registered in `AppModule`:

```
src/
├── app.module.ts (root module - imports all features)
├── main.ts (bootstrap)
├── auth/              (Authentication & JWT tokens)
├── users/             (User profiles & KYC)
├── projects/          (Project management & crowdfunding)
├── donations/         (Blockchain donations)
├── mail/              (Email notifications)
├── logger/            (Pino logging service)
├── database/          (TypeORM config & migrations)
├── common/            (Shared utilities)
└── types/             (TypeScript type definitions)
```

### Key Architecture Decisions
- **Modular Structure**: Each feature (auth, users, projects, donations) is a self-contained module
- **Monolithic Backend**: Single API serving all endpoints
- **Dependency Injection**: NestJS IoC container for managing services
- **Global Validation Pipe**: Automatic DTO validation on all requests
- **Bearer JWT Auth**: Stateless authentication with JWT tokens stored in Authorization header
- **Global Exception Filter**: Centralized error handling with standardized response format

---

## 2. Authentication & Guards

### Architecture

#### JWT Strategy (`src/auth/strategies/jwt.strategy.ts`)
- Extracts JWT from `Authorization: Bearer <token>` header
- Validates signature using `JWT_SECRET` from config
- Returns `JwtPayload` object to `req.user`
- Throws `UnauthorizedException` for invalid/expired tokens

```typescript
// JWT Payload Structure
interface JwtPayload {
  sub: string;           // user ID
  email: string;
  role: UserRole;
  walletAddress?: string;
}
```

#### JWT Guard (`src/common/guards/jwt-auth.guard.ts`)
- Extends Passport's `AuthGuard('jwt')`
- **Key Feature**: Respects `@Public()` decorator - skips auth for public routes
- Applied globally in `AuthModule` with `APP_GUARD`
- Checks `IS_PUBLIC_KEY` metadata before validating JWT

```typescript
// How it works:
- If route has @Public() → skips JWT validation
- Otherwise → validates JWT token
- If invalid → returns 401 with UnauthorizedException
```

#### Roles Guard (`src/common/guards/roles.guard.ts`)
- Validates user has required role for endpoint
- Used in conjunction with `@Roles(UserRole.CREATOR, UserRole.ADMIN)`
- Returns `true` (allow) if user role matches required roles
- Returns `false` if no roles required (allows all authenticated users)

```typescript
// Example usage in Projects Controller:
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
async create() { }
```

### Authentication Flow

1. **Registration** (`POST /auth/register`)
   - Validates password (8+ chars, uppercase, lowercase, number, special char)
   - Hashes password with bcrypt (10 rounds)
   - Creates user with `role: UserRole.USER`
   - Returns `AccessToken` + `RefreshToken`

2. **Login** (`POST /auth/login`)
   - Validates email + password
   - Generates new tokens if credentials valid
   - Returns `AccessToken` (15m expiry) + `RefreshToken` (7d expiry)

3. **Token Usage**
   - All protected routes require: `Authorization: Bearer <accessToken>`
   - Tokens decoded in JWT Guard
   - User context available via `@CurrentUser()` decorator or `req.user`

### User Roles
```typescript
enum UserRole {
  USER = 'user',       // Default for registered users
  ADMIN = 'admin',     // Platform administrators
  CREATOR = 'creator', // Project creators
  DONOR = 'donor',     // Donors (optional, not actively used)
}
```

### Decorators

**@Public()** - Skip JWT validation for route
```typescript
@Get(':id')
@Public()
async findOne(@Param('id') id: string) { } // No JWT required
```

**@Roles(...roles)** - Require specific role(s)
```typescript
@Post()
@Roles(UserRole.CREATOR)
async create() { } // Only CREATOR role allowed
```

**@CurrentUser(field?)** - Extract user from request
```typescript
create(@CurrentUser() user: JwtPayload) { }        // Entire payload
create(@CurrentUser('sub') userId: string) { }     // Just user ID
create(@CurrentUser('role') role: UserRole) { }    // Just role
```

---

## 3. Database Setup

### Configuration
- **Type**: PostgreSQL
- **Connection**: Configured in `src/database/data-source.ts`
- **Migrations**: TypeORM migrations in `src/database/migrations/`
- **Entities**: Auto-discovered from `dist/**/*.entity.js`
- **Synchronize**: `false` (use migrations only)

### Environment Variables
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=stellaraid_db
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=refresh-secret
```

### Entity Relationships

#### User Entity
```typescript
@Entity('users')
id: string (PK, UUID)
email: string (UNIQUE)
password: string (hashed)
firstName: string
lastName: string
walletAddress: string | null (UNIQUE)
country: string | null
bio: string | null
avatarUrl: string | null
role: UserRole (enum)
isEmailVerified: boolean (default: false)
kycStatus: KYCStatus (enum: NONE, SUBMITTED, APPROVED, REJECTED)
kycDocumentUrl: string | null
refreshTokenHash: string | null
createdAt: DateTime
updatedAt: DateTime
deletedAt: DateTime | null (soft delete)
```

**Indexes**: `email`, `walletAddress`

#### Project Entity
```typescript
@Entity('projects')
id: string (PK, UUID)
title: string
description: string (text)
imageUrl: string | null
category: ProjectCategory (enum)
status: ProjectStatus (enum)
goalAmount: decimal(18,7)
fundsRaised: decimal(18,7)
progress: decimal(5,2) // percentage
donationCount: int
deadline: DateTime | null
rejectionReason: string | null
creatorId: string (FK → User)

// Relations
creator: User (ManyToOne, eager: false)
images: ProjectImage[] (OneToMany, cascade)
donations: Donation[] (OneToMany, cascade)
history: ProjectHistory[] (OneToMany, cascade)

createdAt: DateTime
updatedAt: DateTime
```

**Indexes**: `creatorId`, `status`, `title`, `description`

#### Donation Entity
```typescript
@Entity('donations')
id: string (PK, UUID)
projectId: string (FK → Project)
donorId: string | null (FK → User, nullable)
amount: decimal(18,7)
assetType: string (default: 'XLM')
transactionHash: string | null (UNIQUE)
isAnonymous: boolean (default: false)
createdAt: DateTime

// Relations
project: Project (ManyToOne, onDelete: CASCADE)
donor: User | null (ManyToOne, onDelete: SET NULL, nullable)
```

**Indexes**: `projectId`, `transactionHash` (UNIQUE)

### Relationship Rules
1. **User → Projects**: 1-to-many (creator can have many projects)
2. **User → Donations**: 1-to-many (donor can make many donations)
3. **Project → Donations**: 1-to-many (deleteing project cascades to donations)
4. **Project → User**: many-to-1 (creator required)
5. **Donation → User**: many-to-1 (nullable - allows anonymous donations)

---

## 4. DTO Patterns

### General Pattern
- Located in `module/dto/` folder
- Inherit from base DTOs using `PartialType()` for update variants
- Use **class-validator** decorators for validation
- Use **Swagger** decorators for API documentation

### Validation Decorators Used
```typescript
// Common validators
@IsNotEmpty()              // Field required
@IsString()                // Must be string
@IsNumber()                // Must be number
@IsEmail()                 // Must be valid email
@IsEnum(MyEnum)            // Must be valid enum value
@IsOptional()              // Field optional
@IsUrl()                   // Must be valid URL
@Min(value)                // Minimum number value
@MinLength(length)         // Minimum string length
@Matches(regex)            // Must match regex

// Custom options
@IsNotEmpty({ message: 'Custom error message' })
```

### Donation Module DTOs

#### CreateDonationDto
```typescript
export class CreateDonationDto {
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsOptional()
  @IsString()
  assetType?: string; // default: 'XLM'

  @IsNotEmpty()
  @IsString()
  transactionHash: string;

  @IsOptional()
  isAnonymous?: boolean; // default: false
}
```

#### UpdateDonationDto
```typescript
export class UpdateDonationDto extends PartialType(CreateDonationDto) {}
// All fields optional - inherited from CreateDonationDto
```

#### DonationResponseDto
```typescript
export class DonationResponseDto {
  id: string;
  projectId: string;
  donorId: string | null;
  amount: number;
  assetType: string;
  transactionHash: string | null;
  isAnonymous: boolean;
  createdAt: Date;

  // Factory method for converting entity to DTO
  static fromEntity(donation: Donation): DonationResponseDto {
    return {
      id: donation.id,
      projectId: donation.projectId,
      donorId: donation.donorId,
      amount: donation.amount,
      assetType: donation.assetType,
      transactionHash: donation.transactionHash,
      isAnonymous: donation.isAnonymous,
      createdAt: donation.createdAt,
    };
  }
}
```

### Auth DTOs

#### RegisterDto
```typescript
export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;
}
```

#### LoginDto
```typescript
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

### Project DTOs

#### CreateProjectDto
```typescript
export class CreateProjectDto {
  @IsNotEmpty()
  @IsString()
  projectName: string;

  @IsNotEmpty()
  @IsString()
  projectDesc: string;

  @IsNotEmpty()
  @IsUrl()
  projectImage: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  fundingGoal: number;

  @IsNotEmpty()
  @Type(() => Date)
  deadline: Date; // Must be future date

  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;
}
```

### DTO Best Practices in This Codebase
1. **Separate Response DTOs**: Never return full entity - use response DTO
2. **Factory Methods**: Use static `fromEntity()` to convert entities to DTOs
3. **Partial Updates**: `UpdateDto` extends `PartialType(CreateDto)` for optional fields
4. **Type Transformation**: Use `@Type(() => Number/Date)` to auto-transform input
5. **Validation First**: All validation on DTO, not in service
6. **Swagger Documentation**: Every DTO field has `@ApiProperty()` with example values

---

## 5. Service Patterns

### General Service Structure
Services handle all business logic and database operations:

1. Located in `module/providers/` (follows NestJS convention)
2. Injected into controllers via constructor
3. Repository pattern with TypeORM repositories
4. Error handling with NestJS exceptions

### Donations Service Pattern

```typescript
@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationsRepository: Repository<Donation>,
  ) {}

  // Pattern 1: Create with error handling
  async create(dto: CreateDonationDto): Promise<DonationResponseDto> {
    try {
      const entity = this.donationsRepository.create(dto);
      const saved = await this.donationsRepository.save(entity);
      return DonationResponseDto.fromEntity(saved);
    } catch (error) {
      if (error.code === '23505') { // Postgres unique violation
        throw new ConflictException('Transaction hash already exists');
      }
      throw new BadRequestException('Failed to create donation');
    }
  }

  // Pattern 2: Read with pagination
  async findAll(page: number = 1, limit: number = 10) {
    const [data, total] = await this.donationsRepository.findAndCount({
      relations: ['project', 'donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: data.map(d => DonationResponseDto.fromEntity(d)),
      total,
    };
  }

  // Pattern 3: Single read with not-found check
  async findOne(id: string): Promise<DonationResponseDto> {
    const donation = await this.donationsRepository.findOne({
      where: { id },
      relations: ['project', 'donor'],
    });
    if (!donation) {
      throw new NotFoundException(`Donation ${id} not found`);
    }
    return DonationResponseDto.fromEntity(donation);
  }

  // Pattern 4: Update with validation
  async update(id: string, dto: UpdateDonationDto): Promise<DonationResponseDto> {
    const donation = await this.findOne(id); // Validates existence
    Object.assign(donation, dto); // Merge changes
    try {
      const updated = await this.donationsRepository.save(donation);
      return DonationResponseDto.fromEntity(updated);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Transaction hash already exists');
      }
      throw new BadRequestException('Failed to update donation');
    }
  }

  // Pattern 5: Delete
  async remove(id: string): Promise<void> {
    const donation = await this.findOne(id); // Validates existence
    await this.donationsRepository.delete(donation.id);
  }

  // Pattern 6: Aggregate query
  async getTotalDonationsForProject(projectId: string): Promise<number> {
    const result = await this.donationsRepository
      .createQueryBuilder('donation')
      .select('SUM(donation.amount)', 'total')
      .where('donation.projectId = :projectId', { projectId })
      .getRawOne();
    return parseFloat(result.total) || 0;
  }

  // Pattern 7: Count with filter
  async getDonationCountForProject(projectId: string): Promise<number> {
    return await this.donationsRepository.count({
      where: { projectId },
    });
  }
}
```

### Auth Service Pattern
```typescript
@Injectable()
export class AuthService {
  // Password hashing
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);
    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
      role: UserRole.USER,
    });
    await this.userRepository.save(user);
    return this.generateTokens(user);
  }

  // Password verification
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user);
  }

  // Token generation
  async generateTokens(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
      secret: this.configService.get('jwtSecret'),
    });
    return { accessToken, user: {...} };
  }
}
```

### Service Dependency Injection Pattern
```typescript
// In module's providers array
@Module({
  imports: [TypeOrmModule.forFeature([Donation, Project, User])],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}

// In controller
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}
}
```

### Common Exception Patterns
```typescript
// 404 - Resource not found
throw new NotFoundException('Donation not found');

// 409 - Conflict (unique constraint, etc)
throw new ConflictException('Transaction hash already exists');

// 400 - Bad request (validation, invalid data)
throw new BadRequestException('Failed to create donation');

// 401 - Unauthorized
throw new UnauthorizedException('Invalid credentials');

// 403 - Forbidden
throw new ForbiddenException('Access denied');
```

---

## 6. Controller Patterns

### General Controller Structure
Controllers handle HTTP request/response and delegate to services:

```typescript
@ApiTags('resource-name')          // Swagger grouping
@ApiBearerAuth()                   // Document JWT requirement
@Controller('route-path')
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
  ) {}

  // Routes here
}
```

### Donations Controller Pattern

```typescript
@ApiTags('Donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  // Pattern 1: POST - Create
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new donation' })
  @ApiResponse({ status: 201, type: DonationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Transaction hash exists' })
  create(@Body() createDonationDto: CreateDonationDto) {
    return this.donationsService.create(createDonationDto);
  }

  // Pattern 2: GET - List with pagination
  @Get()
  @ApiOperation({ summary: 'Get all donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findAll(page, limit);
  }

  // Pattern 3: GET - Single by ID with UUID validation
  @Get(':id')
  @ApiOperation({ summary: 'Get donation by ID' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.findOne(id);
  }

  // Pattern 4: GET - Filtered list
  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get donations for project' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findByProject(projectId, page, limit);
  }

  // Pattern 5: PATCH - Update
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update donation' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDonationDto: UpdateDonationDto,
  ) {
    return this.donationsService.update(id, updateDonationDto);
  }

  // Pattern 6: DELETE - Remove
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete donation' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.remove(id);
  }
}
```

### Projects Controller Pattern (with Guards)

```typescript
@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
  ) {}

  // Pattern: Protected route with role requirement
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create project (CREATOR only)' })
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @Request() req,
  ) {
    const userId = req.user.sub;
    return this.projectsService.create(createProjectDto, userId);
  }

  // Pattern: Public route (no auth)
  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get project details' })
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOnePublic(id);
  }

  // Pattern: Using @CurrentUser() decorator
  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.projectsService.approve(id, adminId);
  }
}
```

### Auth Controller Pattern

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Public routes (no @ApiBearerAuth())
  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // Protected route
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req) {
    return req.user;
  }
}
```

### Decorator Usage in Controllers

**@UseGuards()** - Apply guards to route
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)  // Multiple guards
@UseGuards(JwtAuthGuard)              // Single guard
```

**@Roles()** - Specify required role
```typescript
@Roles(UserRole.CREATOR)              // Single role
@Roles(UserRole.ADMIN, UserRole.CREATOR)  // Multiple roles
```

**@Public()** - Skip JWT validation
```typescript
@Public()  // No auth required for this route
```

**@Param(), @Query(), @Body()** - Extract request data
```typescript
@Param('id', ParseUUIDPipe)           // Route param with UUID validation
@Query('page')                        // Query string param
@Body()                               // Request body (auto-validated via DTO)
```

**@Request()** - Access express request
```typescript
@Request() req  // Contains req.user from JWT payload
// Usage: req.user.sub (user ID), req.user.role, req.user.email
```

### HTTP Status Codes Used
```typescript
@HttpCode(HttpStatus.OK)       // 200
@HttpCode(HttpStatus.CREATED)  // 201
@HttpCode(HttpStatus.NO_CONTENT)  // 204
// Default: 200 for GET, 201 for POST
```

---

## 7. Mail Service

### Configuration
```typescript
// Environment variables required:
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM=noreply@stellaraid.com
MAIL_SUBJECT_PREFIX=[StellarAid]
APP_NAME=StellarAid
FRONTEND_URL=http://localhost:3000
```

### Mail Service Structure (`src/mail/mail.service.ts`)

```typescript
@Injectable()
export class MailService {
  private readonly templatesPath = path.join(__dirname, 'templates');

  async sendWelcomeEmail(user: User): Promise<void> {
    // 1. Load EJS template from templates/welcome.ejs
    const template = fs.readFileSync(templatePath, 'utf-8');

    // 2. Prepare template data with variables
    const templateData = {
      firstName: user.firstName,
      username: user.username,
      appName: this.configService.get('APP_NAME'),
      loginUrl: `${frontendUrl}/login`,
      currentYear: new Date().getFullYear(),
    };

    // 3. Render EJS template with data
    const html = await ejs.render(template, templateData);

    // 4. Send email via Nodemailer
    await this.sendMail({
      from: this.configService.get('MAIL_FROM'),
      to: user.email,
      subject: `[StellarAid] Welcome to StellarAid!`,
      html,
    });
  }

  async sendLoginEmail(user: User, metadata?: LoginMetadata): Promise<void> {
    // Similar pattern for login notifications
  }

  private async sendMail(options: any): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: this.configService.get('MAIL_SECURE'),
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASS'),
      },
    });
    await transporter.sendMail(options);
  }

  // Helper: mask email for logging
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.substring(0, 2)}***@${domain}`;
  }
}
```

### Available Email Templates
Located in `src/mail/templates/`:
- **welcome.ejs** - New user registration
- **login.ejs** - Login notifications

### Template Variable Pattern
Templates receive data object with:
```typescript
{
  firstName: string;
  username: string;
  appName: string;
  currentDate: string;
  currentYear: number;
  loginUrl: string;
  changePasswordUrl: string;
  // Login-specific:
  loginDate: string;
  loginTime: string;
  ipAddress?: string;
  deviceInfo?: string;
}
```

### Error Handling
- Catches email send errors and logs them
- Returns error instead of throwing (doesn't fail request)
- Email failures don't block user operations
- Used for non-critical notifications

---

## 8. Error Handling

### Global Exception Filter (`src/common/filters/http-exeption.filter.ts`)

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LoggerService) private logger?: LoggerService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extract message and errors from exception
    let message = 'Error occurred';
    let errors = null;

    // Handle string response (simple message)
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    }
    // Handle object response (structured errors)
    else if (typeof exceptionResponse === 'object') {
      const res: any = exceptionResponse;
      message = res.message || message;
      // Parse validation errors from array of messages
      errors = Array.isArray(res.message)
        ? res.message.map((msg: string) => ({
            field: msg.split(' ')[0],
            message: msg,
          }))
        : null;
    }

    // Log error with stack trace
    if (this.logger) {
      this.logger.error(`${status} - ${message}`, (exception as any).stack, {
        path: request.url,
        method: request.method,
      });
    }

    // Return standardized error response
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Standardized Error Response Format
```typescript
{
  success: false,
  statusCode: 400,
  message: "Field validation failed",
  errors: [
    { field: "email", message: "email must be an email" },
    { field: "password", message: "password is too short" }
  ],
  timestamp: "2024-03-26T10:30:00.000Z",
  path: "/auth/register"
}
```

### NestJS Exceptions Used

```typescript
// 400 - Bad Request
throw new BadRequestException('Invalid input');

// 401 - Unauthorized
throw new UnauthorizedException('Invalid credentials');

// 403 - Forbidden
throw new ForbiddenException('Access denied');

// 404 - Not Found
throw new NotFoundException('Resource not found');

// 409 - Conflict
throw new ConflictException('Duplicate entry');

// 500 - Internal Server Error
throw new InternalServerErrorException('Server error');
```

### Validation Error Flow
1. Request arrives with body data
2. DTO class-validator decorators run
3. If validation fails → `BadRequestException` thrown
4. Filter catches it and formats response
5. Returns 400 with parsed error messages

### Example Error Response
```json
{
  "success": false,
  "statusCode": 409,
  "message": "A donation with this transaction hash already exists",
  "errors": null,
  "timestamp": "2024-03-26T10:30:00.000Z",
  "path": "/donations"
}
```

### Global Validation Pipe
Configured in `main.ts`:
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,                    // Strip unknown properties
    forbidNonWhitelisted: true,        // Reject unknown properties with error
    transform: true,                    // Auto-transform to DTO types
    transformOptions: {
      enableImplicitConversion: true,  // Auto-convert string to number, etc
    },
  }),
);
```

---

## 9. Existing Tests

### Test Structure
Located in `test/` folder mirroring `src/` structure:

```
test/
├── app.controller.spec.ts
├── app.e2e-spec.ts
├── auth/
│   ├── auth.controller.spec.ts
│   └── auth.services.spec.ts
├── users/
│   └── users.service.spec.ts
├── projects/
│   ├── projects.controller.spec.ts
│   └── projects.service.spec.ts
├── mail/
│   └── mail.service.spec.ts
└── guards/
    ├── jwt-auth.guard.spec.ts
    └── roles.guard.spec.ts
```

### Unit Test Pattern (Service)

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  // Mock the repository
  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));

    // Clear mocks before each test
    jest.clearAllMocks();
  });

  describe('findById', () => {
    const mockUser: User = { /* mock data */ };

    describe('success scenarios', () => {
      it('should return user when found by id', async () => {
        mockRepository.findOne.mockResolvedValue(mockUser);

        const result = await service.findById(mockUser.id);

        expect(result).toEqual(mockUser);
        expect(repository.findOne).toHaveBeenCalledWith({
          where: { id: mockUser.id },
        });
      });
    });

    describe('error scenarios', () => {
      it('should throw NotFoundException when user not found', async () => {
        mockRepository.findOne.mockResolvedValue(null);

        await expect(service.findById('non-existent')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});
```

### Auth Service Test Pattern

```typescript
describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let jwtService: jest.Mocked<JwtService>;

  // Mock external modules
  jest.mock('bcrypt', () => ({
    hash: jest.fn(),
    compare: jest.fn(),
  }));

  beforeEach(async () => {
    const mockUserRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockJwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
  });

  // Tests here
});
```

### E2E Test Pattern (`test/app.e2e-spec.ts`)

```typescript
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],  // Import full app module
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
```

### Test Commands
```bash
npm run test              # Run all unit tests
npm run test:watch       # Watch mode
npm run test:cov         # With coverage report
npm run test:e2e         # E2E tests only
npm run test:debug       # Debug mode
```

### Test Coverage
Coverage reports generated in `coverage/` folder with:
- `coverage-final.json` - Machine-readable coverage
- `lcov.info` - LCOV format
- `lcov-report/index.html` - HTML report

### Mock Patterns

**Repository Mocks**:
```typescript
const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

// Usage in test
mockRepository.findOne.mockResolvedValue(mockEntity);
mockRepository.save.mockResolvedValue(savedEntity);
```

**Service Mocks**:
```typescript
const mockService = {
  method: jest.fn(),
};

// Usage
mockService.method.mockResolvedValue(result);
```

**Dependency Mocks**:
```typescript
const module = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: OtherService, useValue: mockOtherService },
  ],
}).compile();
```

---

## 10. Project Structure Summary

### Feature Module Structure (Pattern to Follow)

Each feature module (auth, users, projects, donations) follows this pattern:

```
feature/
├── feature.module.ts           # Module definition with imports/providers
├── feature.controller.ts        # HTTP endpoints
├── dto/
│   ├── create-feature.dto.ts
│   ├── update-feature.dto.ts
│   └── feature-response.dto.ts
├── entities/
│   └── feature.entity.ts        # TypeORM entity
├── providers/
│   └── feature.service.ts       # Business logic
└── services/ (optional)         # Additional services
    └── helper.service.ts
```

### Directory Organization
```
src/
├── app.module.ts                # Root module
├── app.controller.ts
├── app.service.ts
├── main.ts                      # Bootstrap

├── auth/                        # Authentication module
├── users/                       # User management
├── projects/                    # Projects/campaigns
├── donations/                   # Donations (blockchain)
├── mail/                        # Email service
├── logger/                      # Logging service
├── database/                    # TypeORM config
├── common/
│   ├── decorators/             # @Public, @Roles, @CurrentUser
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── filters/                # HttpExceptionFilter
│   ├── interceptors/
│   ├── middleware/
│   ├── services/
│   ├── interfaces/
│   ├── enums/                  # UserRole, ProjectStatus, etc
│   └────── TODO: add a shared module
```

### Git Hooks & Validation
- ESLint configured for code style
- Jest tests for code quality
- Migration validation in `validate-auth-setup.js`

### Build & Deployment
```bash
npm run build                # TypeScript compilation to dist/
npm run start                # Production start (node dist/main.js)
npm run start:dev            # Development with watch mode
npm run start:debug          # Debug mode with inspector

# Migrations
npm run migration:generate   # Generate migration from entity changes
npm run migration:run        # Apply pending migrations
npm run migration:revert     # Rollback last migration
```

---

## Key Patterns to Follow for New Features

### 1. Creating New Endpoint
```typescript
// 1. Create entity in entities/
// 2. Create DTOs in dto/
// 3. Create service in providers/
// 4. Create controller
// 5. Create module with TypeOrmModule.forFeature([Entity])
// 6. Register in AppModule imports
```

### 2. Using Current User Context
```typescript
// Method 1: Via decorator
@Post()
create(@CurrentUser() user: JwtPayload) {
  const userId = user.sub;
}

// Method 2: Via @Request()
@Post()
create(@Request() req) {
  const userId = req.user.sub;
}
```

### 3. Adding Role-Based Route Protection
```typescript
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
async create() { }
```

### 4. Making Route Public
```typescript
@Get(':id')
@Public()  // No JWT required
async findOne() { }
```

### 5. Pagination Pattern
```typescript
async findAll(page: number = 1, limit: number = 10) {
  const [data, total] = await this.repository.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
  });
  return { data, total };
}
```

### 6. Error Handling
```typescript
async findOne(id: string) {
  const entity = await this.repository.findOne({ where: { id } });
  if (!entity) {
    throw new NotFoundException(`${EntityName} ${id} not found`);
  }
  return entity;
}
```

### 7. Response DTO Conversion
```typescript
// In service - always return DTOs, not entities
return ResponseDto.fromEntity(savedEntity);

// In DTO
static fromEntity(entity: Entity): ResponseDto {
  return { /* map properties */ };
}
```

---

## Configuration Files

### Environment (`.env`)
```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=stellaraid_db

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=refresh-secret

# Mail
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=app-password
MAIL_FROM=noreply@stellaraid.com

# App
APP_NAME=StellarAid
NODE_ENV=development
ENABLE_SWAGGER=true
```

### TypeScript (`tsconfig.json`)
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Path aliases for imports

### NestJS (`nest-cli.json`)
- Source root: `src/`
- Dist: `dist/`
- Webpack enabled for builds

---

## Summary of Architectural Decisions

1. **Modular Architecture**: Each feature is a self-contained module manageable independently
2. **Repository Pattern**: Services use TypeORM repositories for data access
3. **DTOs for API**: Never expose entities directly - use response DTOs
4. **Global Guards & Filters**: Centralized auth and error handling
5. **Decorator-Based Configuration**: Routes configured via decorators (@Public, @Roles)
6. **Pagination Support**: All list endpoints support page/limit params
7. **Soft Deletes**: User entity includes DeleteDateColumn for soft delete support
8. **Cascading Operations**: Project deletions cascade to related donations/images
9. **Transaction Integrity**: Donation transactionHash is UNIQUE to prevent duplicates
10. **Logging & Monitoring**: Pino logger with daily file rotation for audit trail

