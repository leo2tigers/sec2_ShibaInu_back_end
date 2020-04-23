import {
    Injectable,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    User,
    InterestedCategory,
    UserSkill,
    InterestedCategoryEnum,
    VerifyRequest,
} from '../entities/user.entity';
import { Repository, getRepository, Like } from 'typeorm';
import {
    CreateUserDto,
    EditUserDto,
    UserNamePasswordDto,
    VerifyApprovalDto,
    BanUserDto,
    VerifyAdminDto,
} from './users.dto';
import bcrypt = require('bcrypt');

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @InjectRepository(InterestedCategory)
        private readonly interestedCategoryRepository: Repository<
            InterestedCategory
        >,

        @InjectRepository(UserSkill)
        private readonly userSkillRepository: Repository<UserSkill>,

        @InjectRepository(VerifyRequest)
        private readonly verifyRequestRepository: Repository<VerifyRequest>,
    ) {}

    async getAllUsers(
        name: string,
        cat: string,
        s1: string,
        s2: string,
        s3: string,
        sort: number,
    ): Promise<User[]> {
        if (!name) name = '';
        let a1 = await this.userRepository.find({
            select: ['userId'],
            where: {
                firstName: Like(`%${name}%`),
            },
        });
        let a2 = await this.userRepository.find({
            select: ['userId'],
            where: {
                lastName: Like(`%${name}%`),
            },
        });
        let data = [[]];
        for (let i = 0; i < a1.length; i++) data[0].push(a1[i].userId);
        for (let i = 0; i < a2.length; i++) data[0].push(a2[i].userId);
        if (cat) {
            let cat0 = await this.userRepository.query(
                `select userId from interested_category where interestedCategory = '${cat}'`,
            );
            data.push([]);
            for (let i = 0; i < cat0.length; i++)
                data[data.length - 1].push(cat0[i].userId);
        }
        if (s1) {
            let sk1 = await this.userRepository.query(
                `select userId from user_skill where skill = '${s1}'`,
            );
            data.push([]);
            for (let i = 0; i < sk1.length; i++)
                data[data.length - 1].push(sk1[i].userId);
        }
        if (s2) {
            let sk2 = await this.userRepository.query(
                `select userId from user_skill where skill = '${s2}'`,
            );
            data.push([]);
            for (let i = 0; i < sk2.length; i++)
                data[data.length - 1].push(sk2[i].userId);
        }
        if (s3) {
            let sk3 = await this.userRepository.query(
                `select userId from user_skill where skill = '${s3}'`,
            );
            data.push([]);
            for (let i = 0; i < sk3.length; i++)
                data[data.length - 1].push(sk3[i].userId);
        }
        let userIds = data.reduce((a, b) => a.filter(c => b.includes(c)));
        let sorting: Object;
        switch (Number(sort)) {
            case 0:
                sorting = { userId: 'DESC' };
                break;
            case 1:
                sorting = { userId: 'ASC' };
                break;
            case 2:
                sorting = { sumReviewedScore: 'DESC' };
                break;
            case 3:
                sorting = { sumReviewedScore: 'ASC' };
                break;
            default:
                sorting = { sumReviewedScore: 'DESC' };
                break;
        }
        let ret = await this.userRepository.findByIds(userIds, {
            order: sorting,
        });
        if (ret.length == 0)
            throw new BadRequestException('Not found any User');
        return ret;
    }

    async getUserById(userId: number): Promise<User> {
        let ret = await this.userRepository.findOne(userId);
        if (!ret) throw new BadRequestException('Invalid User');
        return ret;
    }

    async getUserId(userNamePasswordDto: UserNamePasswordDto) {
        let ret = await this.userRepository.find({
            where: {
                username: userNamePasswordDto.username,
                password: userNamePasswordDto.password,
            },
        });
        if (!ret || ret.length == 0)
            throw new BadRequestException('Invalid username or password');
        return ret;
    }

    async getMoneyById(userId: number): Promise<User> {
        let ret = await this.userRepository.findOne({
            select: ['userId', 'money'],
            where: {
                userId: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        delete ret.userId;
        return ret;
    }

    async getUserByUsername(username: string): Promise<User> {
        let ret = await this.userRepository.findOne({
            where: {
                username: username,
            },
        });
        return ret;
    }

    // Currently unusable, use func. above with the entity allowed to get username/password instead.
    async getUserPassword(username: string): Promise<User> {
        const ret = await getRepository(User)
            .createQueryBuilder('user')
            .select(['username', 'password'])
            .where('username = :username', { username })
            .getOne();
        console.log(username);
        if (!ret) throw new BadRequestException('Invalid Username');
        return ret;
    }

    async getCategoryByUserId(userId: number): Promise<InterestedCategory[]> {
        let ret = await this.interestedCategoryRepository.find({
            select: ['interestedCategory'],
            where: {
                user: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async getSkillByUserId(userId: number): Promise<UserSkill[]> {
        let ret = await this.userSkillRepository.find({
            select: ['skill'],
            where: {
                user: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async getAverageReviewdScore(userId: number): Promise<number> {
        let user = await this.getUserById(userId);
        return user.sumReviewedScore / user.reviewedNumber;
    }

    async handleFacebookUser(profile: any) {
        const user = await this.userRepository.findOne({
            username: `fb${profile.id}`,
        });
        if (user) return user;

        let firstName: string;
        if (profile.name.middleName.length > 0) {
            firstName = `${profile.name.givenName} ${profile.name.middleName}`;
        } else {
            firstName = profile.name.givenName;
        }

        await this.createNewUser({
            firstName: firstName,
            lastName: profile.name.familyName,
            username: `fb${profile.id}`,
            password: `passwordunused`,
            email: profile.emails[0].value,
            profilePicture: profile.photos[0].value,
            isSNSAccount: true,
        });

        return await this.userRepository.findOne({
            username: `fb${profile.id}`,
        });
    }

    async createNewUser(createUserDto: CreateUserDto) {
        const hashedPass = await bcrypt.hash(createUserDto.password, 10);
        createUserDto.password = hashedPass;

        createUserDto.createdTime = new Date();
        createUserDto.isVerified = false;
        createUserDto.isVisible = true;
        createUserDto.money = 0;
        createUserDto.sumReviewedScore = 0;
        createUserDto.reviewedNumber = 0;
        createUserDto.isBanned = false;

        if (await this.getUserByUsername(createUserDto.username)) {
            throw new BadRequestException(`This username has been used.`);
        }

        return this.userRepository.insert(createUserDto);
    }

    async createNewUserInterestedCategory(userId, interestedCategory) {
        let ret = await this.interestedCategoryRepository.save({
            user: userId,
            interestedCategory: interestedCategory,
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async createNewUserSkill(userId, skill) {
        let ret = await this.userSkillRepository.save({
            user: userId,
            skill: skill,
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async editUser(editUserDto: EditUserDto) {
        if (editUserDto.interestedCategories) {
            let interestedCategories = editUserDto.interestedCategories;
            delete editUserDto.interestedCategories;

            this.deleteInterestedCategoryOfUserId(editUserDto.userId); //delete

            for (let i = 0; i < interestedCategories.length; i++) {
                //insert
                await this.createNewUserInterestedCategory(
                    editUserDto.userId,
                    interestedCategories[i].interestedCategory,
                );
            }
        }
        if (editUserDto.skills) {
            let skills = editUserDto.skills;
            delete editUserDto.skills;

            this.deleteUserSkillOfUserId(editUserDto.userId); //delete

            for (let i = 0; i < skills.length; i++) {
                //insert
                await this.createNewUserSkill(
                    editUserDto.userId,
                    skills[i].skill,
                );
            }
        }
        let ret = await this.userRepository.save(editUserDto);
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async updateReviewData(userId: number, score: number) {
        console.log(userId, score);
        let user = await this.getUserById(userId);
        let editUserDto = new EditUserDto();
        editUserDto.userId = userId;
        editUserDto.sumReviewedScore = user.sumReviewedScore + score;
        editUserDto.reviewedNumber = user.reviewedNumber + 1;
        return this.editUser(editUserDto);
    }

    async deleteInterestedCategoryOfUserId(userId) {
        let ret = await this.interestedCategoryRepository.delete({
            user: userId,
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async requestVerification(userId: number) {
        const requestedUser = await this.getUserById(userId);
        if (requestedUser.isVerified) {
            throw new BadRequestException(
                `This user have already been verified!`,
            );
        }
        if (await this.verifyRequestRepository.findOne({ requestedUser })) {
            throw new BadRequestException(
                `This user already requested verification and is waiting for admin approval`,
            );
        }
        return this.verifyRequestRepository.insert({
            requestedUser,
        });
    }

    async verifyUser(verifyApprovalDto: VerifyApprovalDto): Promise<any> {
        let res: any = null;
        if (verifyApprovalDto.approve) {
            res = await this.userRepository.update(verifyApprovalDto.user, {
                isVerified: true,
            });
        }
        await this.verifyRequestRepository.delete({
            requestedUser: verifyApprovalDto.user,
        });
        return res;
    }

    async banUser(banUser: BanUserDto): Promise<any> {
        let res: any = null;
        if ((await this.userRepository.findOne(banUser.user)).isAdmin == true)
            throw new ForbiddenException('Admin ban is prohibited');
        res = await this.userRepository.update(banUser.user, {
            isBanned: banUser.isBanned,
            banReason: banUser.banReason,
        });
        if (res.raw.affectedRows == 0)
            throw new BadRequestException('Invalid UserId');
        return res;
    }

    async verifyAdmin(verifyAdminDto: VerifyAdminDto): Promise<any> {
        let res: any = null;
        res = await this.userRepository.update(verifyAdminDto.user, {
            isAdmin: verifyAdminDto.isAdmin,
        });
        if (res.raw.affectedRows == 0)
            throw new BadRequestException('Invalid UserId');
        return res;
    }

    async getAllPendingVerificationRequest(): Promise<VerifyRequest[]> {
        return this.verifyRequestRepository.find();
    }

    async deleteInterestedCategory(
        userId,
        interestedCategory: InterestedCategoryEnum,
    ) {
        let ret = await this.interestedCategoryRepository.delete({
            user: userId,
            interestedCategory: interestedCategory,
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async deleteUserSkillOfUserId(userId) {
        let ret = await this.userSkillRepository.delete({ user: userId });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async deleteUserSkill(userId, skill: string) {
        let ret = await this.userSkillRepository.delete({
            user: userId,
            skill: skill,
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async testUserDecorator(user: any) {
        console.log(user);
        return user;
    }

    async uploadProfilePic(userId, filename: string) {
        return this.userRepository.update(userId, { profilePicture: filename });
    }

    async getProfilePicById(userId: number): Promise<User[]> {
        let ret = await this.userRepository.find({
            select: ['profilePicture'],
            where: {
                userId: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async uploadIDCard(userId, filename: string) {
        return this.userRepository.update(userId, {
            identificationCardPic: filename,
        });
    }

    async getIDCardById(userId: number): Promise<User[]> {
        let ret = await this.userRepository.find({
            select: ['identificationCardPic'],
            where: {
                userId: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }

    async uploadIDCardWithFace(userId, filename: string) {
        return this.userRepository.update(userId, {
            identificationCardWithFacePic: filename,
        });
    }

    async getIDCardWithFaceById(userId: number): Promise<User[]> {
        let ret = await this.userRepository.find({
            select: ['identificationCardWithFacePic'],
            where: {
                userId: userId,
            },
        });
        if (!ret) throw new BadRequestException('Invalid UserId');
        return ret;
    }
}
